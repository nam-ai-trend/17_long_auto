import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {ScriptStudio} from '../src/client/components/ScriptStudio';
import type {YadamApi} from '../src/client/api';
import type {Project} from '../src/shared/contracts';

const project: Project = {
  id: 'project-1',
  name: '분량 보정',
  stage: 'script',
  settings: {runtimeMinutes: 30, dwellPresetId: 'short', era: '조선 후기', styleName: '반실사'},
  storyInput: {mode: 'reference', title: '참고', summary: '충분히 긴 참고 이야기 요약입니다.'},
  candidates: [],
  selectedCandidateId: 'candidate-1',
  chapters: [{id: 'chapter-1', title: '발견', purpose: '질문', sceneIds: ['scene-1']}],
  scenes: [{id: 'scene-1', chapterId: 'chapter-1', title: '발견', location: '산길', objective: '장부 확인', change: '증거 발견', text: '누가 장부를 바꿨을까요?'}],
  storyDevelopment: {
    currentPass: 'complete',
    storyBible: {
      titlePromise: '진실을 밝힌다.', hookQuestion: '누가 장부를 바꿨는가?', protagonistGoal: '진실 확인', failureRisk: '목숨을 잃는다.', endingPromise: '거짓을 밝힌다.', era: '조선 후기', voiceRules: ['한 명의 이야기꾼'], characters: [{id: 'a', name: '해원', role: '주인공', desire: '진실', lack: '불신', speech: '차분하다.'}], foreshadowing: [],
    },
    sceneContracts: [{id: 'scene-1', chapterId: 'chapter-1', title: '발견', location: '산길', timeframe: '밤', characters: ['a'], objective: '장부 확인', obstacle: '추격자', action: '숨는다.', result: '증거 발견', nextQuestion: '누가 바꿨나?', emotionalShift: '공포에서 결심', realismAnchor: '세곡 장부', foreshadowingActions: [], targetSeconds: 90}],
    chapterSummaries: [{chapterId: 'chapter-1', summary: '증거를 발견했다.', completedSceneIds: ['scene-1']}],
    continuityLedger: {characters: [], objects: [], foreshadowing: [], unresolvedQuestions: [], repeatedFacts: []},
    lastHandoff: null,
    validationIssues: [],
  },
  cues: [{id: 'cue-1', sceneId: 'scene-1', text: '누가 장부를 바꿨을까요?', start: 0, end: 12, sourceAudioDuration: 12, gapAfter: 1, gapReason: 'scene', manualGap: null, ttsStatus: 'ready', audioPath: 'audio/narration/cue-1.wav', leadingSilence: 0, trailingSilence: 0.2, ttsError: null}],
  visualBible: [],
  sceneData: [],
  mediaSegments: [],
  visualPromptPackages: [],
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
};

describe('ScriptStudio runtime rebalance', () => {
  it('실제 음성이 모두 준비되면 분량 보정 요청을 실행한다', async () => {
    const user = userEvent.setup();
    const rebalanced = {...project, scenes: [{...project.scenes[0], text: '보정된 대본입니다.'}]};
    const rebalanceStory = vi.fn().mockResolvedValue(rebalanced);
    const api = {
      rebalanceStory,
      generateAllTts: vi.fn(),
      generateCueTts: vi.fn(),
      cueAudioUrl: () => '/audio.wav',
      updateCueGap: vi.fn(),
      buildMediaPlan: vi.fn(),
      getTtsStatus: vi.fn().mockResolvedValue({isRunning: false}),
      stopTts: vi.fn().mockResolvedValue({stopped: true}),
    } as unknown as YadamApi;
    const onProject = vi.fn();

    render(<ScriptStudio project={project} api={api} onProject={onProject} />);
    await user.click(screen.getByRole('button', {name: '실제 시간으로 대본 보정'}));

    expect(rebalanceStory).toHaveBeenCalledWith(project.id);
    expect(onProject).toHaveBeenCalledWith(rebalanced);
  });
});
