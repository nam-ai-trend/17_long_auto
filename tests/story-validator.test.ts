import {describe, expect, it} from 'vitest';
import {validateStoryDraft} from '../src/server/story-validator';

describe('story validation', () => {
  it('첫 씬에 핵심 질문이 없으면 후킹 경고를 만든다', () => {
    const issues = validateStoryDraft({
      storyBible: {
        titlePromise: '진실을 밝힌다.',
        hookQuestion: '누가 장부를 바꿨는가?',
        protagonistGoal: '장부를 되찾는다.',
        failureRisk: '목숨을 잃는다.',
        endingPromise: '거짓을 밝힌다.',
        era: '조선 후기',
        voiceRules: ['한 명의 이야기꾼'],
        characters: [{id: 'haewon', name: '해원', role: '주인공', desire: '진실', lack: '불신', speech: '차분하다.'}],
        foreshadowing: [],
      },
      sceneContracts: [{id: 'scene-1', chapterId: 'chapter-1', title: '발견', location: '산길', timeframe: '밤', characters: ['haewon'], objective: '장부를 줍는다.', obstacle: '추격자', action: '숨는다.', result: '장부를 얻는다.', nextQuestion: '장부 주인은 누구인가?', emotionalShift: '공포에서 결심', realismAnchor: '세곡 장부', foreshadowingActions: [], targetSeconds: 90}],
      scenes: [{id: 'scene-1', chapterId: 'chapter-1', title: '발견', location: '산길', objective: '장부를 줍는다.', change: '장부를 얻는다.', text: '해원은 산길을 천천히 걸었습니다.'}],
    });

    expect(issues).toContainEqual(expect.objectContaining({code: 'opening-hook', sceneIds: ['scene-1']}));
  });
});
