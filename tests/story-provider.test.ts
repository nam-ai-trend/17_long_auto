import {describe, expect, it, vi} from 'vitest';
import request from 'supertest';
import {createApp} from '../src/server/app';
import {createDatabase} from '../src/server/database';
import {generateStoryCandidates} from '../src/server/story-engine';
import type {StoryProvider, TtsProvider} from '../src/server/providers';

const ttsProvider: TtsProvider = {
  status: async () => ({name: 'Qwen3 TTS', status: 'ready', detail: '준비됨'}),
  synthesize: async ({destinationPath}) => ({
    audioPath: destinationPath,
    duration: 2,
    leadingSilence: 0,
    trailingSilence: 0.2,
  }),
};

describe('story provider API integration', () => {
  it('후보 선택 시 장편 공급자 결과와 기억 상태를 프로젝트에 저장한다', async () => {
    const candidates = generateStoryCandidates({
      mode: 'reference',
      title: '참고 제목',
      summary: '흥행 구조만 참고하고 전혀 다른 조선시대 이야기를 만든다.',
    });
    const storyBible = {
      titlePromise: '장인의 솜씨가 거짓 문서를 무너뜨린다.',
      hookQuestion: '죽은 사람의 이름은 왜 사라졌는가?',
      protagonistGoal: '지워진 이름을 되찾는다.',
      failureRisk: '관노로 되돌아간다.',
      endingPromise: '빼앗긴 이름을 되찾는다.',
      era: '조선 후기',
      voiceRules: ['한 명의 이야기꾼'],
      characters: [{id: 'manbok', name: '만복', role: '주인공', desire: '이름 회복', lack: '두려움', speech: '짧고 신중하다.'}],
      foreshadowing: [],
    };
    const ledger = {
      characters: [{characterId: 'manbok', location: '폐사', knowledge: [], emotion: '불안', relationshipState: []}],
      objects: [],
      foreshadowing: [],
      unresolvedQuestions: ['누가 이름을 지웠는가?'],
      repeatedFacts: [],
    };
    const sceneContract = {
      id: 'scene-1',
      chapterId: 'chapter-1',
      title: '사라진 이름',
      location: '폐사',
      timeframe: '밤',
      characters: ['manbok'],
      objective: '족보를 확인한다.',
      obstacle: '먹물이 번져 있다.',
      action: '한지 섬유를 비춘다.',
      result: '이름이 도려내진 흔적을 찾는다.',
      nextQuestion: '누가 종이를 바꿨는가?',
      emotionalShift: '불안에서 결심',
      realismAnchor: '족보 보관 방식',
      foreshadowingActions: [],
      targetSeconds: 90,
    };
    const buildStory = vi.fn(async () => ({
      chapters: [{id: 'chapter-1', title: '빈 목탁', purpose: '질문을 세운다.', sceneIds: ['scene-1']}],
      scenes: [{id: 'scene-1', chapterId: 'chapter-1', title: '사라진 이름', location: '폐사', objective: '족보를 확인한다.', change: '흔적을 찾는다.', text: '죽은 사람의 이름은 왜 사라졌을까요? 만복은 한지를 등불에 비추었습니다.'}],
      storyDevelopment: {
        currentPass: 'complete' as const,
        storyBible,
        sceneContracts: [sceneContract],
        chapterSummaries: [{chapterId: 'chapter-1', summary: '만복이 흔적을 찾았다.', completedSceneIds: ['scene-1']}],
        continuityLedger: ledger,
        lastHandoff: null,
        validationIssues: [],
      },
    }));
    const rebalanceScenes = vi.fn(async ({scenes}: Parameters<StoryProvider['rebalanceScenes']>[0]) =>
      scenes.map((scene) => ({...scene, text: `${scene.text} 분량을 보정한 문장입니다.`})),
    );
    const storyProvider: StoryProvider = {
      status: () => ({name: '테스트 장편 LLM', status: 'ready', detail: '준비됨'}),
      generateCandidates: async () => candidates,
      buildStory,
      rebalanceScenes,
    };
    const app = createApp({
      database: createDatabase(':memory:'),
      ttsProvider,
      storyProvider,
    });
    const created = await request(app)
      .post('/api/projects')
      .send({name: '장편 공급자', runtimeMinutes: 40, dwellPresetId: 'balanced'})
      .expect(201);
    await request(app)
      .post(`/api/projects/${created.body.id}/candidates`)
      .send({mode: 'reference', title: '참고 제목', summary: '흥행 구조만 참고하는 충분히 긴 요약문입니다.'})
      .expect(200);

    const selected = await request(app)
      .post(`/api/projects/${created.body.id}/candidates/${candidates[0].id}/select`)
      .expect(200);

    expect(buildStory).toHaveBeenCalledWith(expect.objectContaining({
      candidate: candidates[0],
      runtimeMinutes: 40,
      era: '조선 후기',
    }));
    expect(selected.body.storyDevelopment.currentPass).toBe('complete');
    expect(selected.body.storyDevelopment.storyBible.hookQuestion).toContain('왜');
    expect(selected.body.cues[0].sceneId).toBe('scene-1');

    const readyProject = {
      ...selected.body,
      cues: selected.body.cues.map((cue: Record<string, unknown>) => ({
        ...cue,
        end: 10,
        sourceAudioDuration: 10,
        gapAfter: 1,
        ttsStatus: 'ready',
        audioPath: 'audio/narration/ready.wav',
      })),
    };
    await request(app)
      .post('/api/projects/import')
      .send({manifest: JSON.stringify(readyProject)})
      .expect(201);
    const rebalanced = await request(app)
      .post(`/api/projects/${created.body.id}/story/rebalance`)
      .expect(200);

    expect(rebalanceScenes).toHaveBeenCalledWith(expect.objectContaining({
      adjustments: [expect.objectContaining({sceneId: 'scene-1', action: 'expand'})],
    }));
    expect(rebalanced.body.scenes[0].text).toContain('분량을 보정한');
    expect(rebalanced.body.cues.every((cue: {ttsStatus: string}) => cue.ttsStatus === 'estimated')).toBe(true);
  });

  it('장편 집필이 중간에 실패해도 마지막 씬 묶음 체크포인트를 보존한다', async () => {
    const candidates = generateStoryCandidates({
      mode: 'reference',
      title: '참고 제목',
      summary: '흥행 구조만 참고하고 전혀 다른 조선시대 이야기를 만든다.',
    });
    const partialScene = {
      id: 'scene-1', chapterId: 'chapter-1', title: '첫 묶음', location: '산길', objective: '단서를 얻는다.', change: '장부를 찾는다.', text: '피 묻은 장부가 산길에 떨어져 있었습니다.',
    };
    const partialDevelopment = {
      currentPass: 'drafting' as const,
      storyBible: {titlePromise: '진실', hookQuestion: '누가 장부를 바꿨는가?', protagonistGoal: '장부 확인', failureRisk: '목숨을 잃는다.', endingPromise: '거짓을 밝힌다.', era: '조선 후기', voiceRules: ['한 명의 이야기꾼'], characters: [{id: 'a', name: '해원', role: '주인공', desire: '진실', lack: '불신', speech: '차분하다.'}], foreshadowing: []},
      sceneContracts: [{id: 'scene-1', chapterId: 'chapter-1', title: '첫 묶음', location: '산길', timeframe: '밤', characters: ['a'], objective: '단서를 얻는다.', obstacle: '추격자', action: '숨는다.', result: '장부를 찾는다.', nextQuestion: '누가 버렸나?', emotionalShift: '공포에서 결심', realismAnchor: '세곡 장부', foreshadowingActions: [], targetSeconds: 90}],
      chapterSummaries: [{chapterId: 'chapter-1', summary: '장부를 찾았다.', completedSceneIds: ['scene-1']}],
      continuityLedger: {characters: [], objects: [], foreshadowing: [], unresolvedQuestions: ['누가 버렸나?'], repeatedFacts: []},
      lastHandoff: null,
      validationIssues: [],
    };
    const storyProvider: StoryProvider = {
      status: () => ({name: '실패 테스트 LLM', status: 'ready', detail: '준비됨'}),
      generateCandidates: async () => candidates,
      buildStory: async (input) => {
        await input.onCheckpoint?.({
          chapters: [{id: 'chapter-1', title: '발견', purpose: '질문', sceneIds: ['scene-1']}],
          scenes: [partialScene],
          storyDevelopment: partialDevelopment,
        });
        throw new Error('두 번째 묶음 생성 실패');
      },
      rebalanceScenes: async ({scenes}) => scenes,
    };
    const app = createApp({database: createDatabase(':memory:'), ttsProvider, storyProvider});
    const created = await request(app)
      .post('/api/projects')
      .send({name: '복구 테스트', runtimeMinutes: 30, dwellPresetId: 'short'})
      .expect(201);
    await request(app)
      .post(`/api/projects/${created.body.id}/candidates`)
      .send({mode: 'reference', title: '참고 제목', summary: '흥행 구조만 참고하는 충분히 긴 요약문입니다.'})
      .expect(200);
    await request(app)
      .post(`/api/projects/${created.body.id}/candidates/${candidates[0].id}/select`)
      .expect(400);

    const reopened = await request(app).get(`/api/projects/${created.body.id}`).expect(200);
    expect(reopened.body.scenes).toEqual([partialScene]);
    expect(reopened.body.storyDevelopment.currentPass).toBe('drafting');
    expect(reopened.body.cues).toHaveLength(1);
  });
});
