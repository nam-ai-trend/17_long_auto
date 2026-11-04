import {describe, expect, it} from 'vitest';
import type {StructuredGenerationRequest, StructuredLlmProvider} from '../src/server/llm-provider';
import {StoryPipeline} from '../src/server/story-pipeline';

const candidate = {
  id: 'candidate-1',
  title: '대숲에 울린 빈 목탁',
  premise: '지필장이가 위조 족보 사건에 휘말린다.',
  hook: '목탁이 울릴 때마다 이름이 하나씩 사라졌다.',
  protagonist: '지필장이 만복',
  location: '담양 대숲과 폐사',
  centralObject: '붉은 섬유가 박힌 한지',
  causalTurn: '도둑으로 몰린 처녀가 지워진 집안의 생존자다.',
  endingPromise: '천한 장인의 솜씨가 빼앗긴 이름을 되찾는다.',
};

const bible = {
  titlePromise: candidate.endingPromise,
  hookQuestion: '목탁이 울릴 때마다 왜 이름이 사라지는가?',
  protagonistGoal: '지워진 이름을 되찾는다.',
  failureRisk: '관노로 되돌아간다.',
  endingPromise: candidate.endingPromise,
  era: '조선 후기',
  voiceRules: ['한 명의 이야기꾼'],
  characters: [{id: 'manbok', name: '만복', role: '주인공', desire: '이름 회복', lack: '두려움', speech: '짧고 신중하다.'}],
  foreshadowing: [{id: 'paper', setup: '붉은 한지', payoff: '종이 섬유 대조'}],
};

const chapters = [
  {id: 'chapter-1', title: '빈 목탁', purpose: '질문을 세운다.', sceneIds: ['scene-1', 'scene-2']},
  {id: 'chapter-2', title: '붉은 종이', purpose: '증거를 뒤집는다.', sceneIds: ['scene-3', 'scene-4']},
];

const contracts = chapters.flatMap((chapter, chapterIndex) =>
  chapter.sceneIds.map((id, sceneIndex) => ({
    id,
    chapterId: chapter.id,
    title: `${chapter.title} ${sceneIndex + 1}`,
    location: chapterIndex === 0 ? '폐사' : '관아 문서고',
    timeframe: sceneIndex === 0 ? '해질녘' : '밤',
    characters: ['manbok'],
    objective: '다음 증거를 얻는다.',
    obstacle: '누군가 흔적을 지운다.',
    action: '종이 섬유를 살핀다.',
    result: `${id}의 단서를 얻는다.`,
    nextQuestion: `${id} 다음에는 누가 움직이는가?`,
    emotionalShift: '의심에서 결심',
    realismAnchor: '조선시대 문서 보관 방식',
    foreshadowingActions: ['paper:reinforce'],
    targetSeconds: 90,
  })),
);

const initialLedger = {
  characters: [{characterId: 'manbok', location: '폐사', knowledge: [], emotion: '불안', relationshipState: []}],
  objects: [{objectId: 'paper', owner: 'manbok', condition: '온전함', significance: '핵심 증거'}],
  foreshadowing: [{id: 'paper', status: 'planted' as const, lastSceneId: 'scene-1'}],
  unresolvedQuestions: ['목탁 소리의 정체'],
  repeatedFacts: [],
};

describe('seven-pass story pipeline', () => {
  it('최대 세 씬씩 집필하고 인수인계 패킷으로 다음 묶음을 이어간다', async () => {
    const requests: StructuredGenerationRequest<unknown>[] = [];
    const checkpoints: Array<{scenes: Array<{id: string}>; currentPass: string}> = [];
    let globalReviewCount = 0;
    const provider: StructuredLlmProvider = {
      status: () => ({name: '테스트 LLM', status: 'ready', detail: '준비됨'}),
      generate: async <T>(request: StructuredGenerationRequest<T>): Promise<T> => {
        requests.push(request as StructuredGenerationRequest<unknown>);
        const input = request.input as Record<string, unknown>;
        if (request.pass === 'hook') return bible as T;
        if (request.pass === 'structure') return {chapters, sceneContracts: contracts} as T;
        if (request.pass === 'continuity') return initialLedger as T;
        if (request.pass === 'scene-contracts') return {sceneContracts: contracts} as T;
        if (request.pass === 'drafting') {
          const packet = input.handoff as {nextSceneContracts: typeof contracts};
          return {
            scenes: packet.nextSceneContracts.map((contract) => ({
              id: contract.id,
              chapterId: contract.chapterId,
              title: contract.title,
              location: contract.location,
              objective: contract.objective,
              change: contract.result,
              text: `${contract.title}의 사건이 이어졌다.\n\n${contract.id}의 마지막 선택이 다음 질문을 남겼다.`,
            })),
            chapterSummaries: packet.nextSceneContracts.map((contract) => ({
              chapterId: contract.chapterId,
              summary: `${contract.chapterId}에서 증거가 바뀌었다.`,
              completedSceneIds: [contract.id],
            })),
            continuityLedger: initialLedger,
          } as T;
        }
        if (request.pass === 'local-review') return input.draft as T;
        if (request.pass === 'global-review') {
          globalReviewCount += 1;
          return {
            scenes: input.scenes,
            chapterSummaries: input.chapterSummaries,
            continuityLedger: input.continuityLedger,
            issues: globalReviewCount === 1
              ? [{code: 'transition', severity: 'error', message: 'scene-4 연결을 고쳐야 한다.', sceneIds: ['scene-4']}]
              : [],
          } as T;
        }
        throw new Error(`예상하지 못한 패스: ${request.pass}`);
      },
    };

    const result = await new StoryPipeline(provider).run(
      {
        candidate,
        storyInput: {
          mode: 'reference',
          title: '성공한 야담의 구조',
          summary: '원작의 고유 요소는 복제하지 않고 정보 공개 순서만 참고한다.',
        },
        runtimeMinutes: 30,
        era: '조선 후기',
      },
      {
        batchSize: 3,
        onCheckpoint: async (checkpoint) => {
          checkpoints.push({
            scenes: checkpoint.scenes.map((scene) => ({id: scene.id})),
            currentPass: checkpoint.storyDevelopment.currentPass,
          });
        },
      },
    );

    expect(new Set(requests.map((request) => request.pass))).toEqual(
      new Set(['hook', 'structure', 'continuity', 'scene-contracts', 'drafting', 'local-review', 'global-review']),
    );
    const draftRequests = requests.filter((request) => request.pass === 'drafting');
    expect(draftRequests).toHaveLength(2);
    expect(draftRequests.every((request) => {
      const input = request.input as {handoff: {nextSceneContracts: unknown[]}};
      return input.handoff.nextSceneContracts.length <= 3;
    })).toBe(true);
    const secondPacket = (draftRequests[1].input as {handoff: {previousEnding: string}}).handoff;
    expect(secondPacket.previousEnding).toContain('scene-3의 마지막 선택');
    expect(requests.filter((request) => request.pass === 'global-review')).toHaveLength(2);
    const targetedReview = requests
      .filter((request) => request.pass === 'local-review')
      .find((request) => 'issues' in (request.input as Record<string, unknown>));
    expect((targetedReview?.input as {draft: {scenes: Array<{id: string}>}}).draft.scenes)
      .toEqual([expect.objectContaining({id: 'scene-4'})]);
    expect(result.scenes.map((scene) => scene.id)).toEqual(contracts.map((contract) => contract.id));
    expect(result.storyDevelopment?.currentPass).toBe('complete');
    expect(result.storyDevelopment?.validationIssues).toEqual([]);
    expect(checkpoints.slice(0, 2).map((checkpoint) => checkpoint.scenes.length)).toEqual([3, 4]);
    expect(checkpoints.at(-1)?.currentPass).toBe('complete');
  });
});
