import {describe, expect, it} from 'vitest';
import {buildMediaPlan} from '../src/server/media-planner';
import {buildSceneData} from '../src/server/scene-data-builder';
import type {NarrationCue, StoryDevelopment, StoryScene} from '../src/shared/contracts';

const scenes: StoryScene[] = [
  {
    id: 'scene-1',
    chapterId: 'chapter-1',
    title: '눈 속의 장부',
    location: '문경 산길',
    objective: '쓰러진 여인의 정체를 확인한다.',
    change: '여인이 관아 장부를 내민다.',
    text: '눈길에 여인이 쓰러져 있었습니다. 해원은 장부를 발견했습니다.',
  },
  {
    id: 'scene-2',
    chapterId: 'chapter-1',
    title: '빈 객주',
    location: '산 아래 객주',
    objective: '장부를 숨길 곳을 찾는다.',
    change: '객주인이 이미 장부를 알고 있다.',
    text: '해원은 객주로 향했습니다. 객주인은 문을 걸어 잠갔습니다.',
  },
];

const cues: NarrationCue[] = [
  {id: 'cue-1', sceneId: 'scene-1', text: '눈길에 여인이 쓰러져 있었습니다.', start: 0, end: 40, sourceAudioDuration: 40, gapAfter: 0.5, gapReason: 'sentence', manualGap: null, ttsStatus: 'ready', audioPath: 'one.wav', leadingSilence: 0, trailingSilence: 0.1, ttsError: null},
  {id: 'cue-2', sceneId: 'scene-1', text: '해원은 장부를 발견했습니다.', start: 40.5, end: 79, sourceAudioDuration: 38.5, gapAfter: 1, gapReason: 'scene', manualGap: null, ttsStatus: 'ready', audioPath: 'two.wav', leadingSilence: 0, trailingSilence: 0.2, ttsError: null},
  {id: 'cue-3', sceneId: 'scene-2', text: '해원은 객주로 향했습니다.', start: 80, end: 95, sourceAudioDuration: 15, gapAfter: 0.5, gapReason: 'sentence', manualGap: null, ttsStatus: 'ready', audioPath: 'three.wav', leadingSilence: 0, trailingSilence: 0.1, ttsError: null},
  {id: 'cue-4', sceneId: 'scene-2', text: '객주인은 문을 걸어 잠갔습니다.', start: 95.5, end: 110, sourceAudioDuration: 14.5, gapAfter: 1.05, gapReason: 'scene', manualGap: null, ttsStatus: 'ready', audioPath: 'four.wav', leadingSilence: 0, trailingSilence: 0.2, ttsError: null},
];

const storyDevelopment: StoryDevelopment = {
  currentPass: 'complete',
  storyBible: {
    titlePromise: '장부의 비밀을 밝힌다.',
    hookQuestion: '여인은 왜 장부를 품고 있었나?',
    protagonistGoal: '장부를 지킨다.',
    failureRisk: '가족이 역적으로 몰린다.',
    endingPromise: '거짓 장부를 뒤집는다.',
    era: '조선 후기',
    voiceRules: ['한 명의 이야기꾼'],
    characters: [
      {id: 'haewon', name: '해원', role: '약초꾼', desire: '진실', lack: '타인을 믿지 못한다.', speech: '낮고 신중하다.'},
      {id: 'innkeeper', name: '객주인', role: '조력자', desire: '가족 보호', lack: '겁이 많다.', speech: '말끝을 흐린다.'},
    ],
    foreshadowing: [],
  },
  sceneContracts: [
    {id: 'scene-1', chapterId: 'chapter-1', title: '눈 속의 장부', location: '문경 산길', timeframe: '눈 내리는 밤', characters: ['haewon'], objective: '여인의 정체를 확인한다.', obstacle: '추위와 추격자', action: '여인을 부축하고 장부를 꺼낸다.', result: '관아 장부를 발견한다.', nextQuestion: '장부를 어디에 숨길 것인가?', emotionalShift: '경계에서 결심', realismAnchor: '등짐과 짚신', foreshadowingActions: [], targetSeconds: 80},
    {id: 'scene-2', chapterId: 'chapter-1', title: '빈 객주', location: '산 아래 객주', timeframe: '같은 날 깊은 밤', characters: ['haewon', 'innkeeper'], objective: '장부를 숨길 곳을 찾는다.', obstacle: '겁에 질린 객주인', action: '객주 문을 두드린다.', result: '객주인이 장부를 알아본다.', nextQuestion: '객주인은 누구의 편인가?', emotionalShift: '결심에서 의심', realismAnchor: '봉놋방과 등잔', foreshadowingActions: [], targetSeconds: 31},
  ],
  chapterSummaries: [],
  continuityLedger: {
    characters: [],
    objects: [{objectId: 'ledger', owner: '해원', condition: '눈에 젖음', significance: '세곡 비리의 증거'}],
    foreshadowing: [],
    unresolvedQuestions: [],
    repeatedFacts: [],
  },
  lastHandoff: null,
  validationIssues: [],
};

describe('TTS 기반 씬 데이터', () => {
  it('실제 문장 시간과 휴지를 씬 범위 및 맥락 데이터로 묶는다', () => {
    const result = buildSceneData({scenes, cues, storyDevelopment});

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'media-scene-scene-1',
      storySceneId: 'scene-1',
      cueIds: ['cue-1', 'cue-2'],
      start: 0,
      end: 80,
      timingSource: 'tts',
      characters: ['해원'],
      location: '문경 산길',
      timeframe: '눈 내리는 밤',
      emotion: '경계에서 결심',
      action: '여인을 부축하고 장부를 꺼낸다.',
    });
    expect(result[0].objectStates[0]).toContain('눈에 젖음');
    expect(result[0].previousLink).toBeNull();
    expect(result[0].nextLink).toContain('장부를 어디에 숨길 것인가');
    expect(result[1].previousLink).toContain('관아 장부를 발견한다');
  });

  it('장소·시간·인물·행동·감정 변화 지점에서 긴 체류 프리셋도 일찍 교체한다', () => {
    const sceneData = buildSceneData({scenes, cues, storyDevelopment});
    const plan = buildMediaPlan({
      totalDuration: 111.05,
      dwellPresetId: 'immersive',
      sceneId: 'scene-1',
      semanticBreaks: [],
      sceneData,
    });
    const firstStill = plan.find((segment) => segment.type === 'still');
    const nextStill = plan.find((segment) => segment.type === 'still' && segment.start === 80);

    expect(firstStill?.end).toBe(80);
    expect(firstStill?.semanticBreak).toContain('장소');
    expect(nextStill).toMatchObject({sceneId: 'scene-2', sceneDataId: 'media-scene-scene-2'});
  });
});
