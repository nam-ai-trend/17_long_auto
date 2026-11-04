import type {
  CreateProjectInput,
  InterviewQuestion,
  InterviewResult,
  InterviewStepInput,
  Job,
  Project,
  StoryCandidate,
  StoryInput,
  VisualBibleEntry,
} from '../shared/contracts';
import type {ProviderStatus} from '../server/providers';

export type ProviderMap = {
  story: ProviderStatus;
  qwen: ProviderStatus;
  higgsfield: ProviderStatus;
  motion: ProviderStatus;
};

export type YadamApi = {
  listProjects: () => Promise<Project[]>;
  providerStatus: () => Promise<ProviderMap>;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  getProject: (id: string) => Promise<Project>;
  generateCandidates: (id: string, input: StoryInput) => Promise<StoryCandidate[]>;
  selectCandidate: (id: string, candidateId: string) => Promise<Project>;
  updateCueGap: (id: string, cueId: string, manualGap: number | null) => Promise<Project>;
  generateAllTts: (id: string) => Promise<Project>;
  getTtsStatus: (id: string) => Promise<{isRunning: boolean}>;
  stopTts: (id: string) => Promise<{stopped: boolean}>;
  generateCueTts: (id: string, cueId: string) => Promise<Project>;
  rebalanceStory: (id: string) => Promise<Project>;
  cueAudioUrl: (projectId: string, cueId: string) => string;
  buildMediaPlan: (id: string) => Promise<Project>;
  updateParallax: (id: string, segmentId: string, enabled: boolean) => Promise<Project>;
  addVisualBibleEntry: (id: string, entry: VisualBibleEntry) => Promise<Project>;
  listJobs: (id: string) => Promise<Job[]>;
  retryJob: (projectId: string, jobId: string) => Promise<Job>;
  exportManifest: (id: string) => Promise<string>;
  importManifest: (manifest: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  generateVisualPrompt: (
    projectId: string,
    promptId: string,
    options?: {model?: string; feedback?: string},
  ) => Promise<Project>;
  updateVisualPrompt: (
    projectId: string,
    promptId: string,
    options: {model?: string; feedback?: string},
  ) => Promise<Project>;
  startVisualBatch: (
    projectId: string,
    options?: {ids?: string[]},
  ) => Promise<{queuedCount: number}>;
  getVisualBatchStatus: (projectId: string) => Promise<{isBatchRunning: boolean}>;
  updateVisualBatchModels: (
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
  ) => Promise<Project>;
  startRender: (
    projectId: string,
    options?: {mode?: 'preview-60s' | 'full'; fps?: number},
  ) => Promise<RenderState>;
  getRenderStatus: (
    projectId: string,
    mode?: 'preview-60s' | 'full',
  ) => Promise<RenderState>;
  interviewNextQuestion: (input: InterviewStepInput) => Promise<InterviewQuestion>;
  interviewSummary: (input: InterviewStepInput) => Promise<InterviewResult>;
};

export interface RenderState {
  isRendering: boolean;
  mode: 'preview-60s' | 'full';
  status: 'idle' | 'rendering' | 'completed' | 'failed';
  progressPercent: number;
  renderedAt: string | null;
  videoUrl: string | null;
  fileSizeBytes: number;
  durationSeconds: number;
  error: string | null;
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {'Content-Type': 'application/json', ...init?.headers},
  });
  if (response.status === 204) return undefined as unknown as T;
  const body = (await response.json()) as T & {error?: string};
  if (!response.ok) throw new Error(body.error ?? '요청을 처리하지 못했습니다.');
  return body;
};

export const api: YadamApi = {
  listProjects: () => request('/api/projects'),
  deleteProject: (id) => request(`/api/projects/${id}`, {method: 'DELETE'}),
  providerStatus: () => request('/api/providers'),
  createProject: (input) => request('/api/projects', {method: 'POST', body: JSON.stringify(input)}),
  getProject: (id) => request(`/api/projects/${id}`),
  generateCandidates: (id, input) =>
    request(`/api/projects/${id}/candidates`, {method: 'POST', body: JSON.stringify(input)}),
  selectCandidate: (id, candidateId) =>
    request(`/api/projects/${id}/candidates/${candidateId}/select`, {method: 'POST'}),
  updateCueGap: (id, cueId, manualGap) =>
    request(`/api/projects/${id}/cues/${cueId}/gap`, {
      method: 'PATCH',
      body: JSON.stringify({manualGap}),
    }),
  generateAllTts: (id) => request(`/api/projects/${id}/tts`, {method: 'POST'}),
  getTtsStatus: (id) => request(`/api/projects/${id}/tts/status`),
  stopTts: (id) => request(`/api/projects/${id}/tts`, {method: 'DELETE'}),
  generateCueTts: (id, cueId) =>
    request(`/api/projects/${id}/cues/${cueId}/tts`, {method: 'POST'}),
  rebalanceStory: (id) => request(`/api/projects/${id}/story/rebalance`, {method: 'POST'}),
  cueAudioUrl: (projectId, cueId) => `/api/projects/${projectId}/cues/${cueId}/audio`,
  buildMediaPlan: (id) => request(`/api/projects/${id}/media-plan`, {method: 'POST'}),
  updateParallax: (id, segmentId, enabled) =>
    request(`/api/projects/${id}/media-segments/${segmentId}/parallax`, {
      method: 'PATCH',
      body: JSON.stringify({enabled}),
    }),
  addVisualBibleEntry: (id, entry) =>
    request(`/api/projects/${id}/visual-bible`, {method: 'POST', body: JSON.stringify(entry)}),
  listJobs: (id) => request(`/api/projects/${id}/jobs`),
  retryJob: (projectId, jobId) =>
    request(`/api/projects/${projectId}/jobs/${jobId}/retry`, {method: 'POST'}),
  exportManifest: async (id) => {
    const response = await fetch(`/api/projects/${id}/manifest`);
    if (!response.ok) throw new Error('프로젝트를 내보내지 못했습니다.');
    return response.text();
  },
  importManifest: (manifest) =>
    request('/api/projects/import', {method: 'POST', body: JSON.stringify({manifest})}),
  generateVisualPrompt: (projectId, promptId, options) =>
    request(`/api/projects/${projectId}/visual-prompts/${promptId}/generate`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    }),
  updateVisualPrompt: (projectId, promptId, options) =>
    request(`/api/projects/${projectId}/visual-prompts/${promptId}`, {
      method: 'PATCH',
      body: JSON.stringify(options),
    }),
  startVisualBatch: (projectId, options) =>
    request(`/api/projects/${projectId}/visual-prompts/batch-generate`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    }),
  getVisualBatchStatus: (projectId) =>
    request(`/api/projects/${projectId}/visual-prompts/batch-status`),
  updateVisualBatchModels: (projectId, options) =>
    request(`/api/projects/${projectId}/visual-prompts/batch-models`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  startRender: (projectId, options) =>
    request(`/api/projects/${projectId}/render`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    }),
  getRenderStatus: (projectId, mode = 'preview-60s') =>
    request(`/api/projects/${projectId}/render-status?mode=${mode}`),
  interviewNextQuestion: (input) =>
    request('/api/interview/question', {method: 'POST', body: JSON.stringify(input)}),
  interviewSummary: (input) =>
    request('/api/interview/summary', {method: 'POST', body: JSON.stringify(input)}),
};
