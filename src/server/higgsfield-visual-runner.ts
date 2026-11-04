import {execFile} from 'node:child_process';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import type {Project, VisualPromptPackage} from '../shared/contracts';
import {ProjectRepository} from './project-repository';
import {syncProjectOutputs} from './project-outputs';

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

  public constructor(
    private readonly database: DatabaseSync,
    private readonly assetRoot: string,
    private readonly execImpl: typeof execFile = execFile,
  ) {}

  public isBatchRunning(projectId: string): boolean {
    return this.activeBatchProjects.has(projectId);
  }

  public async generateSinglePackage(
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

      // 캐릭터 일관성을 위해 캐릭터 시트를 최우선으로 정렬 (최대 3개 참조)
      const charRefs = referenceImagePaths.filter((p) => p.includes('character-'));
      const nonCharRefs = referenceImagePaths.filter((p) => !p.includes('character-'));
      const prioritizedRefs = [...charRefs, ...nonCharRefs].slice(0, 3);

      // 실제 CLI에 전달할 모델 식별자 (seedance_2_0_fast는 seedance_2_0 모델의 fast 모드)
      const actualModel = selectedModel === 'seedance_2_0_fast' ? 'seedance_2_0' : selectedModel;

      // Higgsfield CLI 인자 구성
      const cliArgs = ['generate', 'create', actualModel, '--prompt', combinedPrompt];

      if (isVideo) {
        cliArgs.push('--aspect_ratio', '16:9');

        if (selectedModel === 'seedance_2_0_fast') {
          // Seedance 2.0 Fast: 720p 고속/경제적 모션 + 캐릭터 일관성 유지
          cliArgs.push('--mode', 'fast', '--resolution', '720p');
          if (startImagePath) {
            cliArgs.push('--start-image', startImagePath);
          }
          for (const refImg of charRefs.slice(0, 2)) {
            cliArgs.push('--image', refImg);
          }
        } else if (selectedModel === 'seedance_2_0_mini') {
          // Seedance 2.0 Mini: 720p 초경량 모션
          cliArgs.push('--resolution', '720p');
          if (startImagePath) {
            cliArgs.push('--start-image', startImagePath);
          }
          for (const refImg of charRefs.slice(0, 2)) {
            cliArgs.push('--image', refImg);
          }
        } else if (selectedModel === 'seedance_2_5') {
          // Seedance 2.5: 1080p 시네마틱 omni_reference
          if (startImagePath) {
            cliArgs.push('--start-image', startImagePath);
            cliArgs.push('--mode', 'omni_reference');
            for (const refImg of charRefs.slice(0, 2)) {
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
          for (const refImg of charRefs.slice(0, 2)) {
            cliArgs.push('--image', refImg);
          }
        }
      } else {
        cliArgs.push('--aspect_ratio', targetPkg.aspectRatio || '16:9');
        // 키프레임 및 씬 삽화 생성 시 캐릭터 레퍼런스 이미지 자동 주입
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
  ): Promise<{queuedCount: number}> {
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
      return {queuedCount: 0};
    }

    if (this.activeBatchProjects.has(projectId)) {
      return {queuedCount: ungenerated.length};
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

    return {queuedCount: ungenerated.length};
  }

  public updateBatchModels(
    projectId: string,
    options: {
      model?: string;
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

      if (options.model) {
        if (!targetIdsSet) {
          const isVideoPkg = pkg.kind === 'intro-video';
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
   * Higgsfield CLI 실행 및 일시적 원격 렌더링 실패(failed)에 대비한 지수 백오프 자동 재시도
   */
  private async runCliWithRetry(
    args: string[],
    targetId: string,
    maxRetries = 3,
    delayMs = 4000,
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.runCli(args);
      } catch (caught) {
        lastError = caught;
        const msg = caught instanceof Error ? caught.message : String(caught);
        console.warn(
          `[VisualRunner] ${targetId} 생성 시도 ${attempt}/${maxRetries} 실패: ${msg.trim()}`,
        );

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
