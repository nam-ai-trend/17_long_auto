import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Project, StoryCandidate} from '../src/shared/contracts';
import {App} from '../src/client/App';
import type {YadamApi} from '../src/client/api';

const now = '2026-10-27T10:00:00.000Z';

afterEach(cleanup);
const candidates: StoryCandidate[] = [
  {
    id: 'candidate-1',
    title: '달빛 아래 묻힌 장부',
    premise: '약초꾼이 세곡 비리를 마주한다.',
    hook: '죽은 아버지의 필체가 나타난다.',
    protagonist: '약초꾼 해원',
    location: '문경 산촌',
    centralObject: '세곡 장부',
    causalTurn: '구한 아이가 목격자였다.',
    endingPromise: '거짓 장부를 뒤집는다.',
  },
  {
    id: 'candidate-2',
    title: '검은 나룻배의 맹세',
    premise: '옹기장이가 나루의 비밀을 추적한다.',
    hook: '빈 배에 머리카락이 매여 있다.',
    protagonist: '옹기장이 무진',
    location: '남한강 나루',
    centralObject: '갈라진 나루패',
    causalTurn: '패가 실종자를 가리킨다.',
    endingPromise: '물의 흔적으로 진실을 밝힌다.',
  },
  {
    id: 'candidate-3',
    title: '대숲에 울린 빈 목탁',
    premise: '지필장이가 위조 족보를 파헤친다.',
    hook: '목탁이 울릴 때 이름이 사라진다.',
    protagonist: '지필장이 만복',
    location: '담양 대숲',
    centralObject: '붉은 한지',
    causalTurn: '도둑이 생존자였다.',
    endingPromise: '빼앗긴 이름을 되찾는다.',
  },
];

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-1',
  name: '새 야담',
  stage: 'story',
  settings: {
    runtimeMinutes: 50,
    dwellPresetId: 'long',
    era: '조선 후기',
    styleName: '성인용 반실사 조선시대 삽화풍',
  },
  storyInput: null,
  candidates: [],
  selectedCandidateId: null,
  chapters: [],
  scenes: [],
  storyDevelopment: null,
  cues: [],
  visualBible: [],
  sceneData: [],
  mediaSegments: [],
  visualPromptPackages: [],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('App critical flow', () => {
  it('남다른AI 브랜드와 두 줄 홈 제목을 표시한다', async () => {
    const brandingApi = {listProjects: async () => []} as unknown as YadamApi;

    render(<App api={brandingApi} />);

    expect(await screen.findByRole('img', {name: '남다른AI 로고'})).toBeInTheDocument();
    expect(screen.getByText('남다른AI')).toBeInTheDocument();
    expect(screen.getByText('롱폼 제작 프로그램')).toBeInTheDocument();
    expect(screen.queryByText('야담 제작실')).not.toBeInTheDocument();
    expect(screen.getByText('이야기는 오래 남고,')).toHaveClass('hero-line');
    expect(screen.getByText('제작은 가벼워집니다.')).toHaveClass('hero-line');
  });

  it('레퍼런스 입력에서 후보 선택 후 대본 단계로 이동한다', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    let project = makeProject();
    const api: YadamApi = {
      listProjects: async () => [],
      providerStatus: async () => ({
        story: {name: '구조 설계 엔진', status: 'ready', detail: ''},
        qwen: {name: 'Qwen3 TTS', status: 'disconnected', detail: ''},
        higgsfield: {name: 'Higgsfield', status: 'disconnected', detail: ''},
        motion: {name: '로컬 2D 모션', status: 'ready', detail: ''},
      }),
      createProject: async (input) => {
        project = makeProject({
          name: input.name,
          settings: {...project.settings, runtimeMinutes: input.runtimeMinutes, dwellPresetId: input.dwellPresetId},
        });
        return project;
      },
      getProject: async () => project,
      generateCandidates: async (_id, input) => {
        project = {...project, storyInput: input, candidates};
        return candidates;
      },
      selectCandidate: async (_id, candidateId) => {
        project = {
          ...project,
          stage: 'script',
          selectedCandidateId: candidateId,
          candidates,
          chapters: [{id: 'chapter-1', title: '발견', purpose: '후킹', sceneIds: ['scene-1']}],
          scenes: [
            {
              id: 'scene-1',
              chapterId: 'chapter-1',
              title: '첫 장면',
              location: '산길',
              objective: '비밀 확인',
              change: '증거 발견',
              text: '그날 밤, 장부가 떨어졌습니다.',
            },
          ],
          cues: [
            {
              id: 'cue-001',
              sceneId: 'scene-1',
              text: '그날 밤, 장부가 떨어졌습니다.',
              start: 0,
              end: 3.2,
              sourceAudioDuration: 3.2,
              gapAfter: 1.05,
              gapReason: 'scene',
              manualGap: null,
              ttsStatus: 'estimated',
              audioPath: null,
              leadingSilence: 0,
              trailingSilence: 0,
              ttsError: null,
            },
          ],
        };
        return project;
      },
      updateCueGap: async () => project,
      generateAllTts: async () => {
        project = {
          ...project,
          cues: project.cues.map((cue) => ({
            ...cue,
            ttsStatus: 'ready' as const,
            audioPath: `audio/narration/${cue.id}.wav`,
            leadingSilence: 0.1,
            trailingSilence: 0.2,
          })),
        };
        return project;
      },
      getTtsStatus: async () => ({isRunning: false}),
      stopTts: async () => ({stopped: true}),
      generateCueTts: async () => project,
      rebalanceStory: async () => project,
      cueAudioUrl: (projectId, cueId) => `/api/projects/${projectId}/cues/${cueId}/audio`,
      buildMediaPlan: async () => project,
      updateParallax: async () => project,
      addVisualBibleEntry: async () => project,
      listJobs: async () => [],
      retryJob: async () => {
        throw new Error('사용하지 않음');
      },
      exportManifest: async () => JSON.stringify(project),
      importManifest: async () => project,
      deleteProject: async () => {},
      generateVisualPrompt: async () => project,
      updateVisualPrompt: async () => project,
      startVisualBatch: async () => ({queuedCount: 0}),
      getVisualBatchStatus: async () => ({isBatchRunning: false}),
      syncVisualPrompts: async () => project,
      updateVisualBatchModels: async () => project,
      startRender: async () => ({
        isRendering: false,
        mode: 'preview-60s',
        status: 'idle',
        progressPercent: 0,
        renderedAt: null,
        videoUrl: null,
        fileSizeBytes: 0,
        durationSeconds: 0,
        error: null,
      }),
      getRenderStatus: async () => ({
        isRendering: false,
        mode: 'preview-60s',
        status: 'idle',
        progressPercent: 0,
        renderedAt: null,
        videoUrl: null,
        fileSizeBytes: 0,
        durationSeconds: 0,
        error: null,
      }),
      interviewNextQuestion: async () => ({
        step: 1,
        totalSteps: 3,
        category: '인물과 동기',
        question: '테스트 질문',
        suggestions: [{label: '추천1', detail: '설명1', recommended: true}],
      }),
      interviewSummary: async () => ({
        title: '테스트 제목',
        summary: '테스트 요약',
        strategy: '테스트 전략',
      }),
    };

    render(<App api={api} />);
    await screen.findByRole('heading', {name: /이야기는 오래 남고/});
    await user.click(screen.getByRole('button', {name: '새 이야기 시작'}));

    await user.type(screen.getByLabelText('레퍼런스 제목'), '구해 준 여인의 비밀');
    await user.type(
      screen.getByLabelText('레퍼런스 요약'),
      '위기에 처한 사람을 도운 뒤 감춰진 사건이 드러나는 이야기입니다.',
    );
    await user.click(screen.getByRole('radio', {name: '50분'}));
    await user.click(screen.getByRole('radio', {name: '46–60초'}));
    await user.click(screen.getByRole('button', {name: '이야기 후보 3개 만들기'}));

    expect(await screen.findByText('달빛 아래 묻힌 장부')).toBeVisible();
    expect(screen.getByText('검은 나룻배의 맹세')).toBeVisible();
    expect(screen.getByText('대숲에 울린 빈 목탁')).toBeVisible();
    expect(scrollIntoView).toHaveBeenCalledWith({behavior: 'smooth', block: 'start'});

    scrollTo.mockClear();
    await user.click(screen.getAllByRole('button', {name: '이 이야기 선택'})[0]);
    expect(await screen.findByText('대본 제작실')).toBeVisible();
    expect(screen.getByText('50분')).toBeVisible();
    expect(screen.getByText('46–60초')).toBeVisible();
    expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});

    await user.click(screen.getByRole('button', {name: '전체 음성 생성'}));
    expect(await screen.findByText('실제 음성')).toBeVisible();
  });
});
