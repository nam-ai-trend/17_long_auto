import {describe, expect, it} from 'vitest';
import {createHandoffPacket} from '../src/server/story-memory';

const storyBible = {
  titlePromise: '천한 장인의 손기술이 거짓 족보를 무너뜨린다.',
  hookQuestion: '죽은 사람의 이름이 왜 족보에서 사라졌는가?',
  protagonistGoal: '지워진 사람들의 이름을 되찾는다.',
  failureRisk: '위조범에게 붙잡히면 관노 신분으로 되돌아간다.',
  endingPromise: '공개된 증거로 빼앗긴 이름을 되찾는다.',
  era: '조선 후기',
  voiceRules: ['한 명의 이야기꾼', '현대 시니어가 이해할 수 있는 표준어'],
  characters: [
    {
      id: 'manbok',
      name: '만복',
      role: '주인공',
      desire: '자유인으로 인정받는다.',
      lack: '자신의 솜씨를 숨긴다.',
      speech: '짧고 신중하다.',
    },
  ],
  foreshadowing: [
    {id: 'red-fiber', setup: '붉은 섬유가 든 한지', payoff: '위조 인쇄방의 종이와 대조한다.'},
  ],
};

const continuityLedger = {
  characters: [
    {
      characterId: 'manbok',
      location: '폐사 인쇄방',
      knowledge: ['붉은 섬유의 출처를 안다.'],
      emotion: '두렵지만 물러서지 않는다.',
      relationshipState: ['연화의 말을 절반만 믿는다.'],
    },
  ],
  objects: [
    {
      objectId: 'red-paper',
      owner: '만복',
      condition: '가장자리가 젖었다.',
      significance: '위조 족보를 가려낼 증거',
    },
  ],
  foreshadowing: [
    {id: 'red-fiber', status: 'planted' as const, lastSceneId: 'scene-2'},
  ],
  unresolvedQuestions: ['누가 족보를 고쳤는가?'],
  repeatedFacts: ['만복은 관노 출신이다.'],
};

describe('hierarchical story memory', () => {
  it('전체 원고 대신 현재 장 요약, 장부, 직전 종결부와 다음 세 씬만 전달한다', () => {
    const packet = createHandoffPacket({
      storyBible,
      chapterSummaries: [
        {chapterId: 'chapter-1', summary: '만복이 붉은 한지를 발견했다.', completedSceneIds: ['scene-1', 'scene-2']},
        {chapterId: 'chapter-2', summary: '아직 집필 전이다.', completedSceneIds: []},
      ],
      continuityLedger,
      completedScenes: [
        {
          id: 'scene-1',
          chapterId: 'chapter-1',
          title: '빈 목탁',
          location: '폐사',
          objective: '소리의 정체를 찾는다.',
          change: '붉은 한지를 발견한다.',
          text: `초반 원고 ${'가'.repeat(1400)}`,
        },
        {
          id: 'scene-2',
          chapterId: 'chapter-1',
          title: '지워진 이름',
          location: '인쇄방',
          objective: '한지를 대조한다.',
          change: '연화가 진실 일부를 말한다.',
          text: `앞부분 ${'나'.repeat(1300)}\n\n만복은 젖은 종이를 품에 넣고 대숲 쪽으로 걸음을 옮겼다.`,
        },
      ],
      nextSceneContracts: [
        {id: 'scene-3', chapterId: 'chapter-2', title: '대숲의 발자국', location: '대숲', timeframe: '새벽', characters: ['manbok'], objective: '추적자를 확인한다.', obstacle: '짙은 안개', action: '발자국을 거꾸로 따라간다.', result: '관아 인장이 떨어진다.', nextQuestion: '관아가 왜 개입했는가?', emotionalShift: '두려움에서 분노', realismAnchor: '관아 인장', foreshadowingActions: ['red-fiber:reinforce'], targetSeconds: 90},
        {id: 'scene-4', chapterId: 'chapter-2', title: '관아의 종이', location: '관아', timeframe: '오후', characters: ['manbok'], objective: '종이 출처를 찾는다.', obstacle: '아전의 방해', action: '섬유를 대조한다.', result: '같은 종이임을 밝힌다.', nextQuestion: '원본 족보는 어디 있는가?', emotionalShift: '분노에서 확신', realismAnchor: '관아 문서고', foreshadowingActions: ['red-fiber:payoff'], targetSeconds: 90},
        {id: 'scene-5', chapterId: 'chapter-2', title: '닫힌 문서고', location: '문서고', timeframe: '밤', characters: ['manbok'], objective: '원본 족보를 찾는다.', obstacle: '잠긴 문', action: '종이 말림을 이용한다.', result: '숨은 서랍을 연다.', nextQuestion: '원본을 누가 숨겼는가?', emotionalShift: '확신에서 긴장', realismAnchor: '보관대장', foreshadowingActions: [], targetSeconds: 90},
        {id: 'scene-6', chapterId: 'chapter-3', title: '원본의 주인', location: '문서고', timeframe: '밤', characters: ['manbok'], objective: '주인을 확인한다.', obstacle: '추적자 도착', action: '원본을 감춘다.', result: '주인의 이름을 본다.', nextQuestion: '만복과 무슨 관계인가?', emotionalShift: '긴장에서 충격', realismAnchor: '족보 원본', foreshadowingActions: [], targetSeconds: 90},
      ],
    });

    expect(packet.currentChapterSummary?.chapterId).toBe('chapter-2');
    expect(packet.nextSceneContracts).toHaveLength(3);
    expect(packet.previousEnding).toContain('만복은 젖은 종이를 품에 넣고');
    expect(packet.previousEnding).not.toContain('앞부분');
    expect(JSON.stringify(packet)).not.toContain('초반 원고');
    expect(packet.continuityLedger.foreshadowing[0]).toMatchObject({
      id: 'red-fiber',
      status: 'planted',
    });
  });
});
