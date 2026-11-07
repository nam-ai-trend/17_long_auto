import {execFile} from 'node:child_process';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import type {Project, VisualPromptPackage} from '../shared/contracts';
import {ProjectRepository} from './project-repository';
import {syncProjectOutputs} from './project-outputs';
import {sanitizePromptSafety} from './prompt-safety';

export interface VisualGenerationOptions {
  model?: string;
  feedback?: string;
}

const VIDEO_MODELS = new Set([
  'seedance_2_0_fast',
  'seedance_2_0_mini',
  'seedance_2_5',
  'seedance_2_0',
  'seedance1_5',
  'kling3_0_turbo',
  'kling3_0',
  'kling2_6',
  'veo3_1',
  'grok_video_v15',
]);

const extractMediaUrl = (stdout: string, isVideo: boolean = false): string | null => {
  try {
    let parsed: any = null;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      const firstBrace = stdout.indexOf('{');
      const lastBrace = stdout.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1));
      }
    }

    if (parsed) {
      if (parsed.result_url) return parsed.result_url;
      if (parsed.output?.url) return parsed.output.url;
      if (parsed.result?.url) return parsed.result.url;
      if (parsed.url) return parsed.url;
      if (Array.isArray(parsed.outputs) && parsed.outputs[0]?.url) return parsed.outputs[0].url;
      if (Array.isArray(parsed.results) && parsed.results[0]?.url) return parsed.results[0].url;
    }
  } catch {}

  // 비디오인 경우 .mp4, .mov, .webm을 최우선으로 매칭하여 썸네일 webp가 다운로드되는 현상 방지
  if (isVideo) {
    const videoMatch = stdout.match(/https:\/\/[^\s"'<>]+\.(mp4|mov|webm)[^\s"'<>]*/i);
    if (videoMatch) return videoMatch[0];
  }

  // Regex fallback for media URLs (cdn, s3, higgsfield url)
  const match = stdout.match(/https:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp|mp4|mov|webm)[^\s"'<>]*/i);
  return match ? match[0] : null;
};

export class HiggsfieldVisualRunner {
  private activeBatchProjects = new Set<string>();
  private activeSingleGenerations = new Set<string>();

  public constructor(
    private readonly database: DatabaseSync,
    private readonly assetRoot: string,
    private readonly execImpl: typeof execFile = execFile,
  ) {}

  public isBatchRunning(projectId: string): boolean {
    return this.activeBatchProjects.has(projectId);
  }

  public isPackageRunning(packageId: string): boolean {
    return this.activeSingleGenerations.has(packageId);
  }

  /**
   * 백그라운드 배치나 단건 실행 프로세스가 없는데 DB에 'generating' 또는 'queued'로
   * 고착된 좀비 패키지를 정리 (generating -> failed, queued -> planned)
   */
  public cleanupZombies(projectId: string): Project {
    const repo = new ProjectRepository(this.database, this.assetRoot);
    const project = repo.get(projectId);
    if (!project) return project as any;

    const isBatchActive = this.activeBatchProjects.has(projectId);
    let modified = false;

    const updatedPackages = project.visualPromptPackages.map((pkg) => {
      const isPkgActive = this.activeSingleGenerations.has(pkg.id);

      // 배치가 돌고 있거나 단건 실행 중이면 정상 진행 중이므로 건드리지 않음
      if (isBatchActive || isPkgActive) {
        return pkg;
      }

      // 백그라운드 프로세스가 없는데 generating으로 고착된 경우 -> failed로 전환
      if (pkg.status === 'generating') {
        modified = true;
        return {
          ...pkg,
          status: 'failed' as const,
          error: pkg.error || '생성 프로세스가 중단되었습니다. [다시 시도]를 눌러주세요.',
        };
      }

      // 백그라운드 배치가 없는데 queued로 대기 중인 경우 -> planned로 복귀
      if (pkg.status === 'queued') {
        modified = true;
        return {
          ...pkg,
          status: 'planned' as const,
        };
      }

      return pkg;
    });

    if (modified) {
      project.visualPromptPackages = updatedPackages;
      const saved = repo.save(project);
      syncProjectOutputs(saved, this.assetRoot);
      return saved;
    }

    return project;
  }

  public async generateSinglePackage(
    projectId: string,
    packageId: string,
    options: VisualGenerationOptions = {},
  ): Promise<Project> {
    this.activeSingleGenerations.add(packageId);
    try {
      return await this.executeGenerateSinglePackage(projectId, packageId, options);
    } finally {
      this.activeSingleGenerations.delete(packageId);
    }
  }

  private async executeGenerateSinglePackage(
    projectId: string,
    packageId: string,
    options: VisualGenerationOptions = {},
  ): Promise<Project> {
    const repo = new ProjectRepository(this.database, this.assetRoot);
    const project = repo.get(projectId);
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

    const targetIndex = project.visualPromptPackages.findIndex((item) => item.id === packageId);
    if (targetIndex === -1) throw new Error('생성 요청 패키지를 찾을 수 없습니다.');

    const targetPkg = project.visualPromptPackages[targetIndex];
    const selectedModel = options.model?.trim() || targetPkg.model || 'seedream_5_0_flash';
    const feedbackText = options.feedback?.trim() || '';

    // 상태를 generating으로 갱신
    const generatingPkg: VisualPromptPackage = {
      ...targetPkg,
      model: selectedModel,
      feedback: feedbackText || targetPkg.feedback,
      status: 'generating',
      error: null,
    };

    project.visualPromptPackages[targetIndex] = generatingPkg;
    repo.save(project);

    try {
      // 프롬프트 구성 (피드백이 있으면 반영)
      let combinedPrompt = targetPkg.prompt;
      if (feedbackText) {
        combinedPrompt = `${targetPkg.prompt}. User revision feedback: ${feedbackText}`;
      }

      // 유명 연예인 및 실존 인물 실명에 의한 저작권/초상권 필터 차단 방지 살균
      combinedPrompt = sanitizePromptSafety(combinedPrompt);

      // 장소 및 오브제 기준팩에 사람이 생성되는 것을 원천 차단
      if (targetPkg.kind === 'location-reference') {
        if (!combinedPrompt.includes('no people') && !combinedPrompt.includes('no humans')) {
          combinedPrompt = `${combinedPrompt}. Pure architectural and natural scenery, completely uninhabited, vacant background, strictly no people, no humans, no crowd, no characters`;
        }
      } else if (targetPkg.kind === 'object-reference') {
        if (!combinedPrompt.includes('no people') && !combinedPrompt.includes('no humans')) {
          combinedPrompt = `${combinedPrompt}. Isolated prop still-life, strictly no people, no humans, no hands holding`;
        }
      }

      const isVideo = VIDEO_MODELS.has(selectedModel) || targetPkg.kind === 'intro-video';
      const outputExt = isVideo ? 'mp4' : 'png';

      // 저장 디렉토리 준비
      const visualDir = join(this.assetRoot, projectId, 'visuals');
      if (!existsSync(visualDir)) {
        mkdirSync(visualDir, {recursive: true});
      }
      const localFilePath = join(visualDir, `${targetPkg.id}.${outputExt}`);

      // 도입 영상일 경우: 연관된 도입 키프레임이 있는지 확인하고 자동 연계
      let startImagePath: string | null = null;
      const latestProj = repo.get(projectId) ?? project;

      if (isVideo && targetPkg.kind === 'intro-video') {
        const keyframePkg = latestProj.visualPromptPackages.find(
          (p) => p.kind === 'intro-keyframe' && p.mediaSegmentId === targetPkg.mediaSegmentId,
        );

        if (keyframePkg) {
          const keyframeLocalPath = join(visualDir, `${keyframePkg.id}.png`);
          // 키프레임이 아직 없으면 선행 생성
          if (!existsSync(keyframeLocalPath) || keyframePkg.status !== 'ready') {
            try {
              await this.generateSinglePackage(projectId, keyframePkg.id);
            } catch (kfError) {
              console.warn('[VisualRunner] 키프레임 선행 생성 경고:', kfError);
            }
          }
          if (existsSync(keyframeLocalPath)) {
            startImagePath = keyframeLocalPath;
          }
        }
      }

      // 참조 에셋(캐릭터 시트 등) 경로 수집 및 미생성 시 자동 선행 생성
      const referenceImagePaths: string[] = [];
      const isReferenceSheet =
        targetPkg.kind === 'character-reference' ||
        targetPkg.kind === 'location-reference' ||
        targetPkg.kind === 'object-reference';

      if (!isReferenceSheet && targetPkg.referenceKeys && targetPkg.referenceKeys.length > 0) {
        for (const refKey of targetPkg.referenceKeys) {
          const refPkgId = refKey.startsWith('prompt-reference-')
            ? refKey
            : `prompt-reference-${refKey}`;
          const refPkg = latestProj.visualPromptPackages.find((p) => p.id === refPkgId);
          const refFilePath = join(visualDir, `${refPkgId}.png`);

          if (refPkg && (!existsSync(refFilePath) || refPkg.status !== 'ready')) {
            try {
              await this.generateSinglePackage(projectId, refPkg.id);
            } catch (refError) {
              console.warn(`[VisualRunner] 레퍼런스 ${refPkgId} 선행 생성 경고:`, refError);
            }
          }

          if (existsSync(refFilePath)) {
            referenceImagePaths.push(refFilePath);
          }
        }
      }

      // 인물·장소·오브제 기준팩이 고르게 주입되도록 균형 정렬 (인물 1 + 장소 1 + 오브제 1 최우선 보장)
      const charRefs = referenceImagePaths.filter((p) => p.includes('character-'));
      const locationRefs = referenceImagePaths.filter((p) => p.includes('location-'));
      const objectRefs = referenceImagePaths.filter((p) => p.includes('object-'));
      const otherRefs = referenceImagePaths.filter(
        (p) => !p.includes('character-') && !p.includes('location-') && !p.includes('object-'),
      );

      const prioritizedRefs = [
        ...charRefs.slice(0, 1),
        ...locationRefs.slice(0, 1),
        ...objectRefs.slice(0, 1),
        ...charRefs.slice(1, 2),
        ...locationRefs.slice(1, 2),
        ...objectRefs.slice(1, 2),
        ...otherRefs,
      ].slice(0, 3);

      // 같은 씬(동일 장소) 내 연속되는 키프레임/삽화인 경우, 직전 컷의 완료된 이미지를 연속성 앵커로 보조 주입 (슬롯 여유 시)
      if (!isVideo && !isReferenceSheet && prioritizedRefs.length < 3 && targetPkg.sceneDataId) {
        const sameSceneImagePkgs = latestProj.visualPromptPackages.filter(
          (p) =>
            p.kind === targetPkg.kind &&
            p.sceneDataId === targetPkg.sceneDataId,
        );
        const myIdxInScene = sameSceneImagePkgs.findIndex((p) => p.id === targetPkg.id);
        if (myIdxInScene > 0) {
          const prevPkg = sameSceneImagePkgs[myIdxInScene - 1];
          const prevFilePath = join(visualDir, `${prevPkg.id}.png`);
          if (existsSync(prevFilePath) && !prioritizedRefs.includes(prevFilePath)) {
            prioritizedRefs.push(prevFilePath);
          }
        }
      }

      // 비디오 생성 시에도 인물 + 장소 + 오브제 기준팩을 함께 전달하여 60초 도입부의 배경·소품·인물 일관성 유지
      const videoRefs = [
        ...charRefs.slice(0, 1),
        ...locationRefs.slice(0, 1),
        ...objectRefs.slice(0, 1),
      ].slice(0, 3);

      // 실제 CLI에 전달할 모델 식별자 (seedance_2_0_fast는 seedance_2_0 모델의 fast 모드)
      const actualModel = selectedModel === 'seedance_2_0_fast' ? 'seedance_2_0' : selectedModel;

      // Higgsfield CLI 인자 구성
      const cliArgs = ['generate', 'create', actualModel, '--prompt', combinedPrompt];

      if (isVideo) {
        cliArgs.push('--aspect_ratio', '16:9');

        if (selectedModel === 'seedance_2_0_fast') {
          // Seedance 2.0 Fast: 720p 고속/경제적 모션 + 캐릭터·장소·오브제 일관성 유지
          cliArgs.push('--mode', 'fast', '--resolution', '720p');
          if (startImagePath) {
            cliArgs.push('--start-image', startImagePath);
          }
          for (const refImg of videoRefs) {
            cliArgs.push('--image', refImg);
          }
        } else if (selectedModel === 'seedance_2_0_mini') {
          // Seedance 2.0 Mini: 720p 초경량 모션
          cliArgs.push('--resolution', '720p');
          if (startImagePath) {
            cliArgs.push('--start-image', startImagePath);
          }
          for (const refImg of videoRefs) {
            cliArgs.push('--image', refImg);
          }
        } else if (selectedModel === 'seedance_2_5') {
          // Seedance 2.5: 1080p 시네마틱 omni_reference
          if (startImagePath) {
            cliArgs.push('--start-image', startImagePath);
            cliArgs.push('--mode', 'omni_reference');
            for (const refImg of videoRefs) {
              cliArgs.push('--image', refImg);
            }
          } else if (referenceImagePaths.length > 0) {
            cliArgs.push('--start-image', referenceImagePaths[0]);
            cliArgs.push('--mode', 'omni_reference');
          } else {
            cliArgs.push('--mode', 't2v');
          }
        } else {
          // 기타 비디오 모델
          if (startImagePath) {
            cliArgs.push('--start-image', startImagePath);
          }
          for (const refImg of videoRefs) {
            cliArgs.push('--image', refImg);
          }
        }
      } else {
        cliArgs.push('--aspect_ratio', targetPkg.aspectRatio || '16:9');
        // 키프레임 및 씬 삽화 생성 시 인물·장소·오브제 레퍼런스 이미지 자동 주입
        for (const refImg of prioritizedRefs) {
          cliArgs.push('--image', refImg);
        }
      }

      cliArgs.push('--wait', '--json');

      // Higgsfield CLI 실행 (서버 측 일시 장애 대비 최대 3회 자동 재시도)
      const stdout = await this.runCliWithRetry(cliArgs, targetPkg.id);
      const mediaUrl = extractMediaUrl(stdout, isVideo);

      if (!mediaUrl) {
        throw new Error(
          `Higgsfield 생성 결과를 수신하지 못했습니다. CLI 출력:\n${stdout.slice(0, 300)}`,
        );
      }

      // 미디어 파일 다운로드하여 로컬에 저장
      await this.downloadFile(mediaUrl, localFilePath);

      // 성공 상태 업데이트
      const relativeAssetUrl = `/api/projects/${projectId}/visual-prompts/${targetPkg.id}/media`;
      const currentProject = repo.get(projectId) ?? project;
      const readyPkg: VisualPromptPackage = {
        ...generatingPkg,
        status: 'ready',
        assetUrl: relativeAssetUrl,
        error: null,
      };

      currentProject.visualPromptPackages[targetIndex] = readyPkg;
      const saved = repo.save(currentProject);
      syncProjectOutputs(saved, this.assetRoot);
      return saved;
    } catch (caught) {
      const errorMessage = caught instanceof Error ? caught.message : String(caught);
      const currentProject = repo.get(projectId) ?? project;
      const failedPkg: VisualPromptPackage = {
        ...generatingPkg,
        status: 'failed',
        error: errorMessage,
      };
      currentProject.visualPromptPackages[targetIndex] = failedPkg;
      const saved = repo.save(currentProject);
      syncProjectOutputs(saved, this.assetRoot);
      throw caught;
    }
  }

  public async startBatchGenerate(
    projectId: string,
    options: {ids?: string[]} = {},
  ): Promise<{queuedCount: number; project?: Project}> {
    const repo = new ProjectRepository(this.database, this.assetRoot);
    const project = repo.get(projectId);
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

    const targetIdsSet = options.ids && options.ids.length > 0 ? new Set(options.ids) : null;

    // 이미 생성 완료된 항목(status === 'ready' && assetUrl)은 제외하고, 대상 중 아직 생성되지 않은 항목만 추출!
    const ungenerated = project.visualPromptPackages.filter(
      (item) =>
        !(item.status === 'ready' && item.assetUrl) &&
        (!targetIdsSet || targetIdsSet.has(item.id)),
    );

    if (ungenerated.length === 0) {
      return {queuedCount: 0, project};
    }

    // 대상 패키지들을 'queued' 상태로 즉시 마킹하여 사용자에게 큐 등록 피드백 전달
    const ungeneratedIds = new Set(ungenerated.map((u) => u.id));
    project.visualPromptPackages = project.visualPromptPackages.map((pkg) => {
      if (ungeneratedIds.has(pkg.id) && pkg.status !== 'ready' && pkg.status !== 'generating') {
        return {...pkg, status: 'queued' as const, error: null};
      }
      return pkg;
    });
    const savedProject = repo.save(project);
    syncProjectOutputs(savedProject, this.assetRoot);

    if (this.activeBatchProjects.has(projectId)) {
      return {queuedCount: ungenerated.length, project: savedProject};
    }

    this.activeBatchProjects.add(projectId);

    // 백그라운드에서 순차 생성 실행
    void (async () => {
      try {
        for (const target of ungenerated) {
          // 실행 전 현재 상태 재확인 (중간에 단건 생성되었을 수 있음)
          const latestProject = repo.get(projectId);
          if (!latestProject) break;
          const currentItem = latestProject.visualPromptPackages.find((item) => item.id === target.id);
          if (currentItem && currentItem.status === 'ready' && currentItem.assetUrl) {
            continue; // 이미 생성된 건 건너뛰기
          }

          try {
            await this.generateSinglePackage(projectId, target.id, {
              model: currentItem?.model || target.model,
              feedback: currentItem?.feedback || target.feedback || undefined,
            });
          } catch (itemError) {
            console.error(`[BatchGenerate] 항목 ${target.id} 생성 실패:`, itemError);
            // 실패하더라도 다음 항목 계속 진행
          }
        }
      } finally {
        this.activeBatchProjects.delete(projectId);
      }
    })();

    return {queuedCount: ungenerated.length, project: savedProject};
  }

  public updateBatchModels(
    projectId: string,
    options: {
      model?: string;
      imageModel?: string;
      videoModel?: string;
      targetType?: 'all' | 'image' | 'video';
      ids?: string[];
      categoryModels?: {
        character?: string;
        location?: string;
        object?: string;
        intro?: string;
        still?: string;
        video?: string;
      };
    },
  ): Project {
    const repo = new ProjectRepository(this.database, this.assetRoot);
    const project = repo.get(projectId);
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

    const targetIdsSet = options.ids ? new Set(options.ids) : null;

    project.visualPromptPackages = project.visualPromptPackages.map((pkg) => {
      if (targetIdsSet && !targetIdsSet.has(pkg.id)) {
        return pkg;
      }

      if (options.categoryModels) {
        if (pkg.kind === 'character-reference' && options.categoryModels.character) {
          return {...pkg, model: options.categoryModels.character};
        }
        if (pkg.kind === 'location-reference' && options.categoryModels.location) {
          return {...pkg, model: options.categoryModels.location};
        }
        if (pkg.kind === 'object-reference' && options.categoryModels.object) {
          return {...pkg, model: options.categoryModels.object};
        }
        if (pkg.kind === 'intro-keyframe' && options.categoryModels.intro) {
          return {...pkg, model: options.categoryModels.intro};
        }
        if (pkg.kind === 'intro-video' && options.categoryModels.video) {
          return {...pkg, model: options.categoryModels.video};
        }
        if (pkg.kind === 'scene-still' && options.categoryModels.still) {
          return {...pkg, model: options.categoryModels.still};
        }
      }

      const isVideoPkg = pkg.kind === 'intro-video';

      // 이미지 및 영상 전용 모델 분리 적용
      if (options.imageModel && !isVideoPkg) {
        return {...pkg, model: options.imageModel};
      }
      if (options.videoModel && isVideoPkg) {
        return {...pkg, model: options.videoModel};
      }

      // targetType 명시적 지정 지원
      if (options.targetType === 'image') {
        if (!isVideoPkg && options.model) {
          return {...pkg, model: options.model};
        }
        return pkg;
      }
      if (options.targetType === 'video') {
        if (isVideoPkg && options.model) {
          return {...pkg, model: options.model};
        }
        return pkg;
      }

      if (options.model) {
        if (!targetIdsSet) {
          const isVideoModel = VIDEO_MODELS.has(options.model);
          if (isVideoPkg && !isVideoModel) return pkg;
          if (!isVideoPkg && isVideoModel) return pkg;
        }
        return {...pkg, model: options.model};
      }

      return pkg;
    });

    const saved = repo.save(project);
    syncProjectOutputs(saved, this.assetRoot);
    return saved;
  }

  /**
   * 원격 Higgsfield 클라우드 작업 상태를 대조하여 완료된 미디어는 자동 수신하고,
   * 실패/중단된 작업은 명확하게 failed 상태 및 에러 사유로 복구하는 동기화 메소드
   */
  public async reconcileWithRemote(projectId: string): Promise<Project> {
    const repo = new ProjectRepository(this.database, this.assetRoot);
    const project = repo.get(projectId);
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

    let remoteJobs: any[] = [];
    try {
      const stdout = await this.runCli(['generate', 'list', '--json']);
      remoteJobs = JSON.parse(stdout.trim());
    } catch (listErr) {
      console.warn('[VisualRunner] 원격 작업 목록 조회 실패:', listErr);
      return project;
    }

    if (!Array.isArray(remoteJobs) || remoteJobs.length === 0) {
      return project;
    }

    const visualDir = join(this.assetRoot, projectId, 'visuals');
    if (!existsSync(visualDir)) {
      mkdirSync(visualDir, {recursive: true});
    }

    let modified = false;

    const extractActionAndScene = (text: string) => {
      const clean = text
        .toLowerCase()
        .replace(/김수현|도윤/g, '수현')
        .replace(/kim\s*soo-?hyun|do-?yun/g, 'su-hyeon')
        .replace(/[^\w\s가-힣]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const actionMatch = clean.match(/action\s+([a-z가-힣0-9\s]{5,60})/);
      const sceneMatch = clean.match(/scene\s+([a-z가-힣0-9\s]{5,60})/);
      const refMatch = clean.match(/(character|location|canonical prop)\s+reference\s+(sheet\s+for\s+)?([a-z가-힣0-9\s]{2,30})/);

      return {
        action: actionMatch ? actionMatch[1].trim() : '',
        scene: sceneMatch ? sceneMatch[1].trim() : '',
        ref: refMatch ? refMatch[3].trim() : '',
      };
    };

    for (let i = 0; i < project.visualPromptPackages.length; i++) {
      const pkg = project.visualPromptPackages[i];
      const isVideo = VIDEO_MODELS.has(pkg.model) || pkg.kind === 'intro-video';
      const outputExt = isVideo ? 'mp4' : 'png';
      const localFilePath = join(visualDir, `${pkg.id}.${outputExt}`);

      // 이미 로컬 파일이 온전히 존재하고 ready 상태인 항목은 스킵
      if (pkg.status === 'ready' && existsSync(localFilePath)) {
        continue;
      }

      const pkgInfo = extractActionAndScene(pkg.prompt);

      // 원격 작업 중 미디어 종류와 고유 액션/레퍼런스가 일치하는 최근 작업 탐색
      const matchingJob = remoteJobs.find((job) => {
        const isJobVideo =
          VIDEO_MODELS.has(job.job_type) ||
          job.params?.mode === 'fast' ||
          Boolean(job.result_url?.endsWith('.mp4'));

        // 비디오/이미지 종류가 다르면 절대 매칭 금지
        if (isVideo !== isJobVideo) return false;

        const jobInfo = extractActionAndScene(job.params?.prompt || '');

        if (pkgInfo.ref && jobInfo.ref) {
          return pkgInfo.ref === jobInfo.ref || jobInfo.ref.includes(pkgInfo.ref);
        }

        if (pkgInfo.action && jobInfo.action) {
          const pSub = pkgInfo.action.slice(0, 20);
          const jSub = jobInfo.action.slice(0, 20);
          return pkgInfo.action === jobInfo.action || pkgInfo.action.includes(jSub) || jobInfo.action.includes(pSub);
        }

        return false;
      });

      if (matchingJob) {
        if (matchingJob.status === 'completed' && matchingJob.result_url) {
          try {
            await this.downloadFile(matchingJob.result_url, localFilePath);
            project.visualPromptPackages[i] = {
              ...pkg,
              status: 'ready',
              assetUrl: `/api/projects/${projectId}/visual-prompts/${pkg.id}/media`,
              error: null,
            };
            modified = true;
          } catch (dlErr) {
            console.error(`[VisualRunner] 원격 미디어 다운로드 실패 (${pkg.id}):`, dlErr);
          }
        } else if (matchingJob.status === 'ip_detected') {
          project.visualPromptPackages[i] = {
            ...pkg,
            status: 'failed',
            error: '저작권 제한 (초상권/공인 보호): 실존 인물명이 감지되어 AI 서버에서 생성이 거부되었습니다. [다시 시도]를 눌러주세요.',
          };
          modified = true;
        } else if (matchingJob.status === 'failed' || matchingJob.status === 'rejected') {
          project.visualPromptPackages[i] = {
            ...pkg,
            status: 'failed',
            error: 'Higgsfield AI 렌더링 서버에서 작업이 실패했습니다. [다시 시도]를 눌러주세요.',
          };
          modified = true;
        }
      } else if (pkg.status === 'generating' && !this.isBatchRunning(projectId) && !this.isPackageRunning(pkg.id)) {
        // 백그라운드 프로세스가 없는데 generating으로 고착된 유령 작업은 failed로 복구하여 재시도 유도
        project.visualPromptPackages[i] = {
          ...pkg,
          status: 'failed',
          error: '생성 프로세스가 중단되었습니다. [다시 시도]를 눌러주세요.',
        };
        modified = true;
      }
    }

    if (modified) {
      const saved = repo.save(project);
      syncProjectOutputs(saved, this.assetRoot);
      return saved;
    }

    return project;
  }

  /**
   * Higgsfield CLI 실행 및 일시적 원격 렌더링 실패(failed / ip_detected)에 대비한 지수 백오프 자동 재시도
   */
  private async runCliWithRetry(
    args: string[],
    targetId: string,
    maxRetries = 3,
    delayMs = 4000,
  ): Promise<string> {
    let lastError: unknown;
    let currentArgs = [...args];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.runCli(currentArgs);
      } catch (caught) {
        lastError = caught;
        const msg = caught instanceof Error ? caught.message : String(caught);
        console.warn(
          `[VisualRunner] ${targetId} 생성 시도 ${attempt}/${maxRetries} 실패: ${msg.trim()}`,
        );

        // ip_detected 발생 시: --start-image가 이미 있는 비디오 작업이라면 중복 얼굴 검열을 유발하는 캐릭터 --image를 우선 제거하고, 재발 시 전체 --image 제거
        if (msg.includes('ip_detected') && currentArgs.includes('--start-image') && currentArgs.includes('--image')) {
          const hasCharRef = currentArgs.some(
            (arg, idx) => idx > 0 && currentArgs[idx - 1] === '--image' && arg.includes('character-'),
          );
          const strippedArgs: string[] = [];
          for (let i = 0; i < currentArgs.length; i++) {
            if (currentArgs[i] === '--image') {
              const nextPath = currentArgs[i + 1] ?? '';
              if (!hasCharRef || nextPath.includes('character-')) {
                i++; // 해당 --image와 파일 경로 인자 건너뛰기
                continue;
              }
            }
            strippedArgs.push(currentArgs[i]);
          }
          currentArgs = strippedArgs;
          console.log(
            `[VisualRunner] ${targetId}: ip_detected 감지로 인해 ${hasCharRef ? '캐릭터 시트 --image만 제외하고 장소·오브제 기준팩을 유지한 채' : '--start-image 키프레임만 유지하고 추가 --image를 제외하여'} 재시도합니다.`,
          );
        }

        if (attempt < maxRetries) {
          // 일시적 클라우드 GPU 타임아웃/부하를 고려해 대기 후 재시도
          const waitTime = delayMs * attempt;
          console.log(`[VisualRunner] ${targetId}: ${waitTime / 1000}초 후 자동 재시도합니다...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    const originalMsg = lastError instanceof Error ? lastError.message : String(lastError);
    if (originalMsg.includes('ended with status "failed"')) {
      const jobMatch = originalMsg.match(/job ([a-f0-9-]+) ended with status "failed"/i);
      const jobId = jobMatch ? jobMatch[1] : '';
      throw new Error(
        `[Higgsfield 서버 일시 오류] AI 렌더링 서버에서 작업이 ${maxRetries}회 연속 실패했습니다 (${jobId ? `job: ${jobId}` : originalMsg.trim()}). 잠시 후 [재생성]을 눌러주세요.`,
      );
    }

    if (originalMsg.includes('ended with status "ip_detected"')) {
      const jobMatch = originalMsg.match(/job ([a-f0-9-]+) ended with status "ip_detected"/i);
      const jobId = jobMatch ? jobMatch[1] : '';
      throw new Error(
        `[저작권/초상권 필터 감지] AI 서버의 공인/초상권 보호 필터(ip_detected)로 인해 작업이 거부되었습니다 (${jobId ? `job: ${jobId}` : ''}). 대본의 인물명을 점검하거나 [다시 시도]를 누르면 정상 생성됩니다.`,
      );
    }

    throw lastError;
  }

  private runCli(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
      };

      this.execImpl('higgsfield', args, {env, maxBuffer: 20 * 1024 * 1024}, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Higgsfield CLI 실행 오류: ${stderr || error.message || stdout}`));
          return;
        }
        resolve(stdout);
      });
    });
  }

  private async downloadFile(url: string, destinationPath: string, maxRetries = 3): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`미디어 다운로드 실패 (${response.status}): ${url}`);
        }
        const buffer = await response.arrayBuffer();
        writeFileSync(destinationPath, Buffer.from(buffer));
        return;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }
      }
    }
    throw lastError;
  }
}
