import {spawn, type ChildProcess} from 'node:child_process';
import {existsSync, mkdirSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {ProjectRepository} from './project-repository';
import type {MediaAsset, YadamCompositionProps} from '../remotion/YadamComposition';

export type RenderMode = 'preview-60s' | 'full';

export interface RenderState {
  isRendering: boolean;
  mode: RenderMode;
  status: 'idle' | 'rendering' | 'completed' | 'failed';
  progressPercent: number;
  renderedAt: string | null;
  videoUrl: string | null;
  fileSizeBytes: number;
  durationSeconds: number;
  error: string | null;
}

export class RemotionRenderer {
  private activeProcesses = new Map<string, ChildProcess>();
  private states = new Map<string, RenderState>();

  constructor(
    private database: DatabaseSync,
    private assetRoot: string,
    private serverPort = 4317,
  ) {}

  private getRenderDir(projectId: string): string {
    const dir = join(this.assetRoot, projectId, 'renders');
    if (!existsSync(dir)) {
      mkdirSync(dir, {recursive: true});
    }
    return dir;
  }

  public getStatus(projectId: string, mode: RenderMode = 'preview-60s'): RenderState {
    const key = `${projectId}:${mode}`;
    const inMemory = this.states.get(key);
    if (inMemory && inMemory.status === 'rendering') {
      return inMemory;
    }

    const renderDir = this.getRenderDir(projectId);
    const outputPath = join(renderDir, `output_${mode}.mp4`);

    if (existsSync(outputPath)) {
      const stats = statSync(outputPath);
      const videoUrl = `/api/projects/${projectId}/render-video?mode=${mode}`;
      return {
        isRendering: false,
        mode,
        status: 'completed',
        progressPercent: 100,
        renderedAt: stats.mtime.toISOString(),
        videoUrl,
        fileSizeBytes: stats.size,
        durationSeconds: mode === 'preview-60s' ? 60 : 0,
        error: null,
      };
    }

    return (
      inMemory ?? {
        isRendering: false,
        mode,
        status: 'idle',
        progressPercent: 0,
        renderedAt: null,
        videoUrl: null,
        fileSizeBytes: 0,
        durationSeconds: 0,
        error: null,
      }
    );
  }

  public startRender(
    projectId: string,
    options: {mode?: RenderMode; fps?: number} = {},
  ): RenderState {
    const mode = options.mode ?? 'preview-60s';
    const key = `${projectId}:${mode}`;

    // 이미 렌더링 중이면 현재 상태 반환
    const current = this.states.get(key);
    if (current && current.status === 'rendering') {
      return current;
    }

    const repo = new ProjectRepository(this.database, this.assetRoot);
    const project = repo.get(projectId);
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

    const renderDir = this.getRenderDir(projectId);
    const outputPath = join(renderDir, `output_${mode}.mp4`);
    const propsPath = join(renderDir, `props_${mode}.json`);

    // 미디어 에셋 매핑 (HTTP URL 사용)
    const mediaAssets: Record<string, MediaAsset> = {};
    const baseUrl = `http://127.0.0.1:${this.serverPort}`;

    for (const pkg of project.visualPromptPackages ?? []) {
      if (pkg.status === 'ready' && pkg.assetUrl) {
        const fullUrl = `${baseUrl}${pkg.assetUrl}`;
        if (pkg.kind === 'intro-video' && pkg.mediaSegmentId) {
          mediaAssets[pkg.mediaSegmentId] = {
            type: 'video',
            url: fullUrl,
            label: '도입 생성 영상',
          };
        } else if (pkg.kind === 'scene-still') {
          if (pkg.mediaSegmentId) {
            mediaAssets[pkg.mediaSegmentId] = {
              type: 'still',
              url: fullUrl,
              label: '조선 수묵채색 삽화',
            };
          }
          if (pkg.sceneDataId) {
            mediaAssets[pkg.sceneDataId] = {
              type: 'still',
              url: fullUrl,
              label: '조선 수묵채색 삽화',
            };
          }
        }
      }
    }

    const title =
      project.candidates.find((c) => c.id === project.selectedCandidateId)?.title ??
      project.name;

    const cuesWithAudio = (project.cues ?? []).map((cue) => ({
      ...cue,
      audioUrl: cue.audioPath
        ? `${baseUrl}/api/projects/${projectId}/cues/${cue.id}/audio`
        : null,
    }));

    const props: YadamCompositionProps = {
      title,
      cues: cuesWithAudio,
      segments: project.mediaSegments,
      mediaAssets,
    };

    writeFileSync(propsPath, JSON.stringify(props, null, 2), 'utf-8');

    const state: RenderState = {
      isRendering: true,
      mode,
      status: 'rendering',
      progressPercent: 0,
      renderedAt: null,
      videoUrl: null,
      fileSizeBytes: 0,
      durationSeconds: mode === 'preview-60s' ? 60 : 0,
      error: null,
    };
    this.states.set(key, state);

    // remotion render CLI 인자 구성
    const cliArgs = [
      'remotion',
      'render',
      'src/remotion/index.ts',
      'YadamPreview',
      outputPath,
      `--props=${propsPath}`,
      '--overwrite',
    ];

    if (mode === 'preview-60s') {
      cliArgs.push('--frames=0-1800'); // 60초 * 30fps = 1800프레임
    }

    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
    };

    const child = spawn('pnpm', cliArgs, {
      cwd: process.cwd(),
      env,
    });

    this.activeProcesses.set(key, child);

    let stderrBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      // 프레임 렌더링 진행률 파싱 (예: "Rendering frames 150/1800" 또는 "150/1800")
      const match = text.match(/(\d+)\/(\d+)/);
      if (match) {
        const currentFrame = parseInt(match[1], 10);
        const totalFrames = parseInt(match[2], 10);
        if (totalFrames > 0) {
          state.progressPercent = Math.min(99, Math.round((currentFrame / totalFrames) * 100));
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    child.on('close', (code) => {
      this.activeProcesses.delete(key);
      state.isRendering = false;

      if (code === 0 && existsSync(outputPath)) {
        const stats = statSync(outputPath);
        state.status = 'completed';
        state.progressPercent = 100;
        state.renderedAt = new Date().toISOString();
        state.videoUrl = `/api/projects/${projectId}/render-video?mode=${mode}`;
        state.fileSizeBytes = stats.size;
        state.error = null;
      } else {
        state.status = 'failed';
        state.error = stderrBuffer.slice(-300) || `Remotion 렌더링 프로세스 오류 (code ${code})`;
      }
    });

    child.on('error', (err) => {
      this.activeProcesses.delete(key);
      state.isRendering = false;
      state.status = 'failed';
      state.error = err.message;
    });

    return state;
  }

  public getOutputFilePath(projectId: string, mode: RenderMode = 'preview-60s'): string | null {
    const renderDir = this.getRenderDir(projectId);
    const outputPath = join(renderDir, `output_${mode}.mp4`);
    return existsSync(outputPath) ? outputPath : null;
  }
}

