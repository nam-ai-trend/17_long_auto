import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {Router} from 'express';
import {HiggsfieldVisualRunner} from './higgsfield-visual-runner';
import {RemotionRenderer} from './remotion-renderer';
import {z} from 'zod';
import {
  createProjectSchema,
  interviewStepInputSchema,
  storyInputSchema,
  visualBibleEntrySchema,
} from '../shared/contracts';
import type {Project, StoryScene, VisualBibleEntry} from '../shared/contracts';
import {VISUAL_LIMITS} from '../shared/presets';
import {JobQueue} from './job-queue';
import {buildMediaPlan} from './media-planner';
import {buildSceneData} from './scene-data-builder';
import {buildVisualPromptPackages, deriveVisualBibleEntries} from './visual-prompt-builder';
import {defaultInterviewEngine, providerStatuses} from './providers';
import type {StoryProvider, TtsProvider, VisualProvider} from './providers';
import {higgsfieldProvider} from './higgsfield-provider';
import {ProjectRepository} from './project-repository';
import {
  buildNarrationCues,
  gapFor,
  recalculateCueTimes,
  splitSentences,
  timelineDuration,
} from './timeline';
import {additionalGapAfterTrailingSilence} from './audio-analysis';
import {findSceneRuntimeAdjustments} from './story-validator';

const gapUpdateSchema = z.object({manualGap: z.number().min(0).max(10).nullable()});
const parallaxUpdateSchema = z.object({enabled: z.boolean()});
const importSchema = z.object({manifest: z.string().min(2)});

const visualLimitFor = (kind: VisualBibleEntry['kind']) =>
  kind === 'character'
    ? VISUAL_LIMITS.characters
    : kind === 'location'
      ? VISUAL_LIMITS.locations
      : VISUAL_LIMITS.objects;

const visualLimitLabel = (kind: VisualBibleEntry['kind']) =>
  kind === 'character' ? '핵심 인물 4명' : kind === 'location' ? '핵심 장소 6곳' : '핵심 오브제 5개';

const narrationCuesForScenes = (scenes: StoryScene[]) =>
  buildNarrationCues(
    scenes.flatMap((scene) => {
      const parts = splitSentences(scene.text);
      return parts.map((text, index) => ({
        sceneId: scene.id,
        text,
        gapReason: index === parts.length - 1 ? ('scene' as const) : ('sentence' as const),
      }));
    }),
  );

export const createRoutes = (
  database: DatabaseSync,
  assetRoot: string,
  ttsProvider: TtsProvider,
  storyProvider: StoryProvider,
  visualProvider: VisualProvider = higgsfieldProvider,
) => {
  const router = Router();
  const projects = new ProjectRepository(database, assetRoot);
  const jobs = new JobQueue(database);
  const visualRunner = new HiggsfieldVisualRunner(database, assetRoot);
  const remotionRenderer = new RemotionRenderer(database, assetRoot);

  const requireProject = (id: string): Project => {
    const project = projects.get(id);
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');
    return project;
  };

  const synthesizeCue = async (project: Project, cueIndex: number): Promise<Project> => {
    const cue = project.cues[cueIndex];
    const relativeAudioPath = join('audio', 'narration', `${cue.id}.wav`);
    const destinationPath = join(assetRoot, project.id, relativeAudioPath);
    const inputHash = createHash('sha256')
      .update(JSON.stringify({text: cue.text, relativeAudioPath}))
      .digest('hex');
    const job = jobs.enqueue(project.id, `tts:${cue.id}`, inputHash);
    if (job.status === 'queued') jobs.claim(job.id);

    let saved = projects.save({
      ...project,
      cues: project.cues.map((item, index) =>
        index === cueIndex ? {...item, ttsStatus: 'generating' as const, ttsError: null} : item,
      ),
    });

    try {
      const result = await ttsProvider.synthesize({text: cue.text, destinationPath});
      const current = saved.cues[cueIndex];
      const readyCue = {
        ...current,
        sourceAudioDuration: result.duration,
        gapAfter: additionalGapAfterTrailingSilence(
          gapFor(current.gapReason),
          result.trailingSilence,
        ),
        ttsStatus: 'ready' as const,
        audioPath: relativeAudioPath,
        leadingSilence: result.leadingSilence,
        trailingSilence: result.trailingSilence,
        ttsError: null,
      };
      const cues = saved.cues.map((item, index) => (index === cueIndex ? readyCue : item));
      jobs.succeed(job.id);
      saved = projects.save({...saved, cues: recalculateCueTimes(cues)});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Qwen3 TTS 생성에 실패했습니다.';
      const failedCues = saved.cues.map((item, index) =>
        index === cueIndex ? {...item, ttsStatus: 'failed' as const, ttsError: message} : item,
      );
      jobs.fail(job.id, message);
      saved = projects.save({...saved, cues: failedCues});
    }
    return saved;
  };

  const activeTtsProjects = new Set<string>();

  const runTtsWorker = async (projectId: string): Promise<Project> => {
    if (activeTtsProjects.has(projectId)) {
      return requireProject(projectId);
    }
    activeTtsProjects.add(projectId);
    try {
      while (activeTtsProjects.has(projectId)) {
        const current = projects.get(projectId);
        if (!current) break;
        const nextIndex = current.cues.findIndex(
          (c) => c.ttsStatus !== 'ready' && c.ttsStatus !== 'failed',
        );
        if (nextIndex < 0) break;
        await synthesizeCue(current, nextIndex);
      }
    } catch (error) {
      console.error(`[TTS Worker] Error in project ${projectId}:`, error);
    } finally {
      activeTtsProjects.delete(projectId);
    }
    return requireProject(projectId);
  };

  router.get('/health', (_request, response) => {
    response.json({ok: true, service: 'yadam-studio'});
  });

  router.get('/providers', async (_request, response) => {
    response.json(await providerStatuses(ttsProvider, storyProvider, visualProvider));
  });

  router.post('/interview/question', async (request, response) => {
    const input = interviewStepInputSchema.parse(request.body);
    const question = await defaultInterviewEngine.getNextQuestion(input);
    response.json(question);
  });

  router.post('/interview/summary', async (request, response) => {
    const input = interviewStepInputSchema.parse(request.body);
    const summary = await defaultInterviewEngine.getSummary(input);
    response.json(summary);
  });

  router.get('/projects', (_request, response) => {
    response.json(projects.list());
  });

  router.post('/projects', (request, response) => {
    const input = createProjectSchema.parse(request.body);
    const project = projects.create(input);
    const projectRoot = join(assetRoot, project.id);
    for (const directory of [
      'audio/narration',
      'audio/music',
      'audio/ambience',
      'audio/sfx',
      'images/characters',
      'images/locations',
      'images/objects',
      'images/scenes',
      'video/intro',
      'motion/layers',
      'captions',
      'renders',
      'exports',
    ]) {
      mkdirSync(join(projectRoot, directory), {recursive: true});
    }
    response.status(201).json(project);
  });

  router.post('/projects/import', (request, response) => {
    const {manifest} = importSchema.parse(request.body);
    response.status(201).json(projects.importManifest(manifest));
  });

  router.get('/projects/:id', (request, response) => {
    response.json(requireProject(request.params.id));
  });

  router.get('/projects/:id/manifest', (request, response) => {
    response.type('application/json').send(projects.exportManifest(request.params.id));
  });

  router.delete('/projects/:id', (request, response) => {
    projects.delete(request.params.id);
    const projectRoot = join(assetRoot, request.params.id);
    try {
      rmSync(projectRoot, {recursive: true, force: true});
    } catch {}
    response.status(204).end();
  });

  router.post('/projects/:id/candidates', async (request, response) => {
    const project = requireProject(request.params.id);
    const storyInput = storyInputSchema.parse(request.body);
    const candidates = await storyProvider.generateCandidates(storyInput);
    projects.save({...project, storyInput, candidates, selectedCandidateId: null});
    response.json(candidates);
  });

  router.post('/projects/:id/candidates/:candidateId/select', async (request, response) => {
    const project = requireProject(request.params.id);
    const candidate = project.candidates.find((item) => item.id === request.params.candidateId);
    if (!candidate) throw new Error('선택할 이야기 후보를 찾을 수 없습니다.');
    if (!project.storyInput) throw new Error('이야기 시작 정보가 없어 장편 대본을 만들 수 없습니다.');
    const draft = await storyProvider.buildStory({
      candidate,
      storyInput: project.storyInput,
      runtimeMinutes: project.settings.runtimeMinutes,
      era: project.settings.era,
      onCheckpoint: (checkpoint) => {
        projects.save({
          ...project,
          name: candidate.title,
          stage: 'story',
          selectedCandidateId: candidate.id,
          chapters: checkpoint.chapters,
          scenes: checkpoint.scenes,
          storyDevelopment: checkpoint.storyDevelopment,
          cues: narrationCuesForScenes(checkpoint.scenes),
        });
      },
    });
    const saved = projects.save({
      ...project,
      name: candidate.title,
      stage: 'script',
      selectedCandidateId: candidate.id,
      chapters: draft.chapters,
      scenes: draft.scenes,
      storyDevelopment: draft.storyDevelopment,
      cues: narrationCuesForScenes(draft.scenes),
    });
    response.json(saved);
  });

  router.patch('/projects/:id/cues/:cueId/gap', (request, response) => {
    const project = requireProject(request.params.id);
    const {manualGap} = gapUpdateSchema.parse(request.body);
    const cues = project.cues.map((cue) =>
      cue.id === request.params.cueId ? {...cue, manualGap} : cue,
    );
    if (!cues.some((cue) => cue.id === request.params.cueId)) {
      throw new Error('수정할 내레이션 문장을 찾을 수 없습니다.');
    }
    response.json(projects.save({...project, cues: recalculateCueTimes(cues)}));
  });

  router.post('/projects/:id/cues/:cueId/tts', async (request, response) => {
    const project = requireProject(request.params.id);
    const cueIndex = project.cues.findIndex((cue) => cue.id === request.params.cueId);
    if (cueIndex < 0) throw new Error('음성을 생성할 문장을 찾을 수 없습니다.');
    const saved = await synthesizeCue(project, cueIndex);
    const failed = saved.cues[cueIndex].ttsStatus === 'failed';
    if (failed) {
      response.status(502).json({error: saved.cues[cueIndex].ttsError, project: saved});
      return;
    }
    response.json(saved);
  });

  router.post('/projects/:id/tts', async (request, response) => {
    const project = requireProject(request.params.id);
    if (process.env.VITEST) {
      const finished = await runTtsWorker(project.id);
      response.json(finished);
      return;
    }
    void runTtsWorker(project.id);
    response.json(project);
  });

  router.get('/projects/:id/tts/status', (request, response) => {
    response.json({isRunning: activeTtsProjects.has(request.params.id)});
  });

  router.delete('/projects/:id/tts', (request, response) => {
    activeTtsProjects.delete(request.params.id);
    response.json({stopped: true});
  });

  router.get('/projects/:id/cues/:cueId/audio', (request, response) => {
    const project = requireProject(request.params.id);
    const cue = project.cues.find((item) => item.id === request.params.cueId);
    if (!cue?.audioPath) throw new Error('재생할 음성 파일이 없습니다.');
    response.sendFile(join(assetRoot, project.id, cue.audioPath));
  });

  router.post('/projects/:id/story/rebalance', async (request, response) => {
    const project = requireProject(request.params.id);
    if (!project.storyDevelopment) {
      throw new Error('장편 집필 기억이 없어 분량을 보정할 수 없습니다.');
    }
    if (project.cues.some((cue) => cue.ttsStatus !== 'ready')) {
      response.status(409).json({error: '모든 문장의 실제 음성을 만든 뒤 씬 분량을 보정해 주세요.'});
      return;
    }
    const adjustments = findSceneRuntimeAdjustments({
      sceneContracts: project.storyDevelopment.sceneContracts,
      cues: project.cues,
    });
    if (adjustments.length === 0) {
      response.json(project);
      return;
    }
    const revised = await storyProvider.rebalanceScenes({
      scenes: project.scenes,
      storyDevelopment: project.storyDevelopment,
      adjustments,
    });
    const revisedById = new Map(revised.map((scene) => [scene.id, scene]));
    const expectedIds = new Set(adjustments.map((adjustment) => adjustment.sceneId));
    if (revised.some((scene) => !expectedIds.has(scene.id))) {
      throw new Error('LLM이 요청하지 않은 씬까지 변경했습니다. 결과를 적용하지 않았습니다.');
    }
    const scenes = project.scenes.map((scene) => revisedById.get(scene.id) ?? scene);
    const cues = scenes.flatMap((scene) => {
      if (!revisedById.has(scene.id)) return project.cues.filter((cue) => cue.sceneId === scene.id);
      const parts = splitSentences(scene.text);
      return buildNarrationCues(
        parts.map((text, index) => ({
          sceneId: scene.id,
          text,
          gapReason: index === parts.length - 1 ? ('scene' as const) : ('sentence' as const),
        })),
      ).map((cue) => ({...cue, id: `cue-${randomUUID()}`}));
    });
    response.json(projects.save({
      ...project,
      stage: 'script',
      scenes,
      cues: recalculateCueTimes(cues),
      sceneData: [],
      mediaSegments: [],
      visualPromptPackages: [],
      storyDevelopment: {
        ...project.storyDevelopment,
        currentPass: 'complete',
        validationIssues: project.storyDevelopment.validationIssues.filter(
          (issue) => issue.code !== 'runtime',
        ),
      },
    }));
  });

  router.post('/projects/:id/media-plan', (request, response) => {
    const project = requireProject(request.params.id);
    if (project.cues.some((cue) => cue.ttsStatus === 'queued' || cue.ttsStatus === 'generating')) {
      response.status(409).json({
        error: '음성 생성이 끝난 뒤 실제 재생시간을 기준으로 시각 설계를 만들어 주세요.',
      });
      return;
    }
    const allNarrationReady =
      project.cues.length > 0 && project.cues.every((cue) => cue.ttsStatus === 'ready');
    const sceneData = buildSceneData({
      scenes: project.scenes,
      cues: project.cues,
      storyDevelopment: project.storyDevelopment,
    });
    const plannedSegments = buildMediaPlan({
      totalDuration: allNarrationReady
        ? timelineDuration(project.cues)
        : project.settings.runtimeMinutes * 60,
      dwellPresetId: project.settings.dwellPresetId,
      sceneId: project.scenes[0]?.id ?? 'scene-1',
      semanticBreaks: [],
      sceneData,
      cues: project.cues,
      existingSegments: project.mediaSegments,
    });
    const visualBible = deriveVisualBibleEntries({
      existing: project.visualBible,
      storyDevelopment: project.storyDevelopment,
      sceneData,
    });
    const rawPackages = buildVisualPromptPackages({
      visualBible,
      sceneData,
      mediaSegments: plannedSegments,
      cues: project.cues,
    });
    const visualDir = join(assetRoot, project.id, 'visuals');
    const existingMap = new Map(project.visualPromptPackages.map((p) => [p.id, p]));
    const visualPromptPackages = rawPackages.map((pkg) => {
      const existing = existingMap.get(pkg.id);
      const hasDiskFile =
        existsSync(join(visualDir, `${pkg.id}.png`)) ||
        existsSync(join(visualDir, `${pkg.id}.mp4`)) ||
        existsSync(join(visualDir, `${pkg.id}.jpg`)) ||
        existsSync(join(visualDir, `${pkg.id}.webp`));

      if (existing?.status === 'ready' && existing.assetUrl) {
        return {...pkg, status: 'ready' as const, assetUrl: existing.assetUrl, model: existing.model ?? pkg.model};
      }
      if (hasDiskFile) {
        return {
          ...pkg,
          status: 'ready' as const,
          assetUrl: `/api/projects/${project.id}/visual-prompts/${pkg.id}/media`,
        };
      }
      return pkg;
    });
    const referencesBySegment = new Map(
      visualPromptPackages
        .filter((item) => item.mediaSegmentId)
        .map((item) => [item.mediaSegmentId!, item.referenceKeys]),
    );
    const mediaSegments = plannedSegments.map((segment) => ({
      ...segment,
      referenceKeys: referencesBySegment.get(segment.id) ?? [],
    }));
    const inputHash = createHash('sha256')
      .update(JSON.stringify({projectId: project.id, sceneData, mediaSegments, visualPromptPackages}))
      .digest('hex');
    jobs.enqueue(project.id, 'media-plan', inputHash);
    response.json(projects.save({
      ...project,
      stage: 'production',
      visualBible,
      sceneData,
      mediaSegments,
      visualPromptPackages,
    }));
  });

  router.patch('/projects/:id/media-segments/:segmentId/parallax', (request, response) => {
    const project = requireProject(request.params.id);
    const {enabled} = parallaxUpdateSchema.parse(request.body);
    const mediaSegments = project.mediaSegments.map((segment) =>
      segment.id === request.params.segmentId ? {...segment, parallaxEnabled: enabled} : segment,
    );
    if (!mediaSegments.some((segment) => segment.id === request.params.segmentId)) {
      throw new Error('수정할 미디어 구간을 찾을 수 없습니다.');
    }
    response.json(projects.save({...project, mediaSegments}));
  });

  router.post('/projects/:id/visual-bible', (request, response) => {
    const project = requireProject(request.params.id);
    const entry = visualBibleEntrySchema.parse({...request.body, id: request.body.id || randomUUID()});
    const currentCount = project.visualBible.filter((item) => item.kind === entry.kind).length;
    if (currentCount >= visualLimitFor(entry.kind)) {
      response.status(400).json({
        error: `${visualLimitLabel(entry.kind)} 상한에 도달했습니다. 기존 항목을 정리하거나 조연으로 유지해 주세요.`,
      });
      return;
    }
    response.json(projects.save({...project, visualBible: [...project.visualBible, entry]}));
  });

  router.get('/projects/:id/jobs', (request, response) => {
    requireProject(request.params.id);
    response.json(jobs.list(request.params.id));
  });

  router.post('/projects/:id/jobs/:jobId/retry', (request, response) => {
    requireProject(request.params.id);
    response.json(jobs.retry(request.params.jobId));
  });

  router.get('/projects/:id/visual-prompts/batch-status', (request, response) => {
    requireProject(request.params.id);
    response.json({isBatchRunning: visualRunner.isBatchRunning(request.params.id)});
  });

  router.post('/projects/:id/visual-prompts/batch-generate', async (request, response) => {
    requireProject(request.params.id);
    const {ids} = request.body ?? {};
    const result = await visualRunner.startBatchGenerate(request.params.id, {ids});
    response.json(result);
  });

  router.post('/projects/:id/visual-prompts/batch-models', (request, response) => {
    requireProject(request.params.id);
    const {model, imageModel, videoModel, targetType, ids, categoryModels} = request.body ?? {};
    const updated = visualRunner.updateBatchModels(request.params.id, {
      model,
      imageModel,
      videoModel,
      targetType,
      ids,
      categoryModels,
    });
    response.json(updated);
  });

  router.post('/projects/:id/visual-prompts/:promptId/generate', async (request, response) => {
    const {model, feedback} = request.body ?? {};
    const updated = await visualRunner.generateSinglePackage(request.params.id, request.params.promptId, {
      model,
      feedback,
    });
    response.json(updated);
  });

  router.patch('/projects/:id/visual-prompts/:promptId', (request, response) => {
    const project = requireProject(request.params.id);
    const {model, feedback} = request.body ?? {};
    const visualPromptPackages = project.visualPromptPackages.map((pkg) => {
      if (pkg.id !== request.params.promptId) return pkg;
      return {
        ...pkg,
        model: model !== undefined ? model : pkg.model,
        feedback: feedback !== undefined ? feedback : pkg.feedback,
      };
    });
    response.json(projects.save({...project, visualPromptPackages}));
  });

  router.get('/projects/:id/visual-prompts/:promptId/media', (request, response) => {
    const project = requireProject(request.params.id);
    const pkg = project.visualPromptPackages.find((item) => item.id === request.params.promptId);
    if (!pkg) throw new Error('생성 요청 패키지를 찾을 수 없습니다.');
    const visualDir = join(assetRoot, project.id, 'visuals');
    const pngPath = join(visualDir, `${pkg.id}.png`);
    const mp4Path = join(visualDir, `${pkg.id}.mp4`);
    const jpgPath = join(visualDir, `${pkg.id}.jpg`);
    const webpPath = join(visualDir, `${pkg.id}.webp`);

    if (existsSync(pngPath)) return response.sendFile(pngPath);
    if (existsSync(mp4Path)) return response.sendFile(mp4Path);
    if (existsSync(jpgPath)) return response.sendFile(jpgPath);
    if (existsSync(webpPath)) return response.sendFile(webpPath);

    response.status(404).json({error: '생성된 미디어 파일을 찾을 수 없습니다.'});
  });

  router.post('/projects/:id/render', (request, response) => {
    requireProject(request.params.id);
    const {mode, fps} = request.body ?? {};
    const state = remotionRenderer.startRender(request.params.id, {mode, fps});
    response.json(state);
  });

  router.get('/projects/:id/render-status', (request, response) => {
    requireProject(request.params.id);
    const mode = (request.query.mode as any) || 'preview-60s';
    const state = remotionRenderer.getStatus(request.params.id, mode);
    response.json(state);
  });

  router.get('/projects/:id/render-video', (request, response) => {
    const project = requireProject(request.params.id);
    const mode = (request.query.mode as any) || 'preview-60s';
    const filePath = remotionRenderer.getOutputFilePath(request.params.id, mode);
    if (!filePath) {
      response.status(404).json({error: '렌더링된 비디오 파일을 찾을 수 없습니다.'});
      return;
    }
    const isDownload = request.query.download === 'true' || request.query.download === '1';
    if (isDownload) {
      const sanitizedName = (project.name || 'yadam').replace(/[\\/:*?"<>|]/g, '_');
      const filename = `${sanitizedName}_${mode === 'full' ? '전체완성본' : '도입60초'}.mp4`;
      response.download(filePath, filename);
    } else {
      response.sendFile(filePath);
    }
  });

  return router;
};
