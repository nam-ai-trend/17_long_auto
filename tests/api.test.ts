import {describe, expect, it} from 'vitest';
import request from 'supertest';
import {createApp} from '../src/server/app';
import {createDatabase} from '../src/server/database';
import {disconnectedHiggsfieldProvider, type TtsProvider} from '../src/server/providers';
import {vi} from 'vitest';

const readyTtsProvider: TtsProvider = {
  status: async () => ({name: 'Qwen3 TTS', status: 'ready', detail: '테스트 연결'}),
  synthesize: async ({destinationPath}) => ({
    audioPath: destinationPath,
    duration: 2.4,
    leadingSilence: 0.1,
    trailingSilence: 0.2,
  }),
};

describe('local API', () => {
  it('프로젝트 생성부터 후보 선택, 큐 생성과 미디어 계획까지 진행한다', async () => {
    const app = createApp({
      database: createDatabase(':memory:'),
      ttsProvider: readyTtsProvider,
      visualProvider: disconnectedHiggsfieldProvider,
    });

    const providers = await request(app).get('/api/providers').expect(200);
    expect(providers.body.higgsfield.status).toBe('disconnected');

    const created = await request(app)
      .post('/api/projects')
      .send({name: '대숲의 비밀', runtimeMinutes: 30, dwellPresetId: 'long'})
      .expect(201);
    const projectId = created.body.id as string;

    const candidates = await request(app)
      .post(`/api/projects/${projectId}/candidates`)
      .send({
        mode: 'reference',
        title: '낯선 선비',
        summary: '억울한 사람을 도운 뒤 숨은 비밀을 마주하는 이야기다.',
      })
      .expect(200);
    expect(candidates.body).toHaveLength(3);

    const selected = await request(app)
      .post(`/api/projects/${projectId}/candidates/${candidates.body[0].id}/select`)
      .expect(200);
    expect(selected.body.stage).toBe('script');
    expect(selected.body.cues.length).toBeGreaterThan(0);

    const firstCue = selected.body.cues[0];
    const voiced = await request(app)
      .post(`/api/projects/${projectId}/cues/${firstCue.id}/tts`)
      .expect(200);
    expect(voiced.body.cues[0]).toMatchObject({
      ttsStatus: 'ready',
      sourceAudioDuration: 2.4,
      leadingSilence: 0.1,
      trailingSilence: 0.2,
      audioPath: `audio/narration/${firstCue.id}.wav`,
    });

    const updated = await request(app)
      .patch(`/api/projects/${projectId}/cues/${firstCue.id}/gap`)
      .send({manualGap: 1.2})
      .expect(200);
    expect(updated.body.cues[0].manualGap).toBe(1.2);

    const planned = await request(app)
      .post(`/api/projects/${projectId}/media-plan`)
      .expect(200);
    expect(planned.body.stage).toBe('production');
    expect(planned.body.mediaSegments.filter((item: {type: string}) => item.type === 'video')).toHaveLength(10);
    expect(planned.body.sceneData.length).toBeGreaterThan(0);
    expect(planned.body.visualPromptPackages.length).toBeGreaterThan(0);
    expect(planned.body.visualPromptPackages[0].kind).toContain('reference');
    expect(
      planned.body.visualPromptPackages.find((item: {kind: string}) => item.kind === 'intro-video'),
    ).toMatchObject({model: 'seedance_2_0_fast', aspectRatio: '16:9'});

    const firstStill = planned.body.mediaSegments.find((item: {type: string}) => item.type === 'still');
    const toggled = await request(app)
      .patch(`/api/projects/${projectId}/media-segments/${firstStill.id}/parallax`)
      .send({enabled: false})
      .expect(200);
    expect(
      toggled.body.mediaSegments.find((item: {id: string}) => item.id === firstStill.id)
        .parallaxEnabled,
    ).toBe(false);

    // 모델 일괄 변경 테스트 (전체 이미지 모델을 nano_banana_flash로 일괄 변경하되 영상 모델은 보존)
    const batchUpdated = await request(app)
      .post(`/api/projects/${projectId}/visual-prompts/batch-models`)
      .send({model: 'nano_banana_flash'})
      .expect(200);

    const stills = batchUpdated.body.visualPromptPackages.filter(
      (item: {kind: string}) => item.kind === 'scene-still',
    );
    expect(stills.length).toBeGreaterThan(0);
    expect(stills.every((item: {model: string}) => item.model === 'nano_banana_flash')).toBe(true);

    const introVideo = batchUpdated.body.visualPromptPackages.find(
      (item: {kind: string}) => item.kind === 'intro-video',
    );
    expect(introVideo.model).toBe('seedance_2_0_fast');

    // 특정 ID만 부분 변경 테스트
    const firstPkg = batchUpdated.body.visualPromptPackages[0];
    const partialUpdated = await request(app)
      .post(`/api/projects/${projectId}/visual-prompts/batch-models`)
      .send({model: 'flux_3_image', ids: [firstPkg.id]})
      .expect(200);
    expect(partialUpdated.body.visualPromptPackages[0].model).toBe('flux_3_image');
    expect(partialUpdated.body.visualPromptPackages[1].model).not.toBe('flux_3_image');
  });

  it('비주얼 바이블 상한을 넘기면 한국어 오류를 돌려준다', async () => {
    const app = createApp({database: createDatabase(':memory:'), ttsProvider: readyTtsProvider});
    const created = await request(app)
      .post('/api/projects')
      .send({name: '인물 상한', runtimeMinutes: 30, dwellPresetId: 'short'})
      .expect(201);

    for (let index = 0; index < 4; index += 1) {
      await request(app)
        .post(`/api/projects/${created.body.id}/visual-bible`)
        .send({
          id: `character-${index}`,
          kind: 'character',
          name: `인물 ${index + 1}`,
          description: '',
          lockedTraits: [],
          status: 'draft',
        })
        .expect(200);
    }

    const overflow = await request(app)
      .post(`/api/projects/${created.body.id}/visual-bible`)
      .send({
        id: 'character-5',
        kind: 'character',
        name: '다섯 번째 인물',
        description: '',
        lockedTraits: [],
        status: 'draft',
      })
      .expect(400);
    expect(overflow.body.error).toContain('4명');
  });

  it('전체 TTS에서 한 문장이 실패해도 나머지 음성 결과를 보존한다', async () => {
    let call = 0;
    const partialProvider: TtsProvider = {
      status: readyTtsProvider.status,
      synthesize: vi.fn(async ({destinationPath}) => {
        call += 1;
        if (call === 2) throw new Error('두 번째 문장 생성 실패');
        return {
          audioPath: destinationPath,
          duration: 2 + call / 10,
          leadingSilence: 0.05,
          trailingSilence: 0.15,
        };
      }),
    };
    const app = createApp({database: createDatabase(':memory:'), ttsProvider: partialProvider});
    const created = await request(app)
      .post('/api/projects')
      .send({name: '부분 성공', runtimeMinutes: 30, dwellPresetId: 'short'})
      .expect(201);
    const candidates = await request(app)
      .post(`/api/projects/${created.body.id}/candidates`)
      .send({
        mode: 'reference',
        title: '실패를 견디는 음성',
        summary: '여러 문장을 음성으로 만들다가 하나만 실패하는 이야기입니다.',
      })
      .expect(200);
    const selected = await request(app)
      .post(`/api/projects/${created.body.id}/candidates/${candidates.body[0].id}/select`)
      .expect(200);

    const voiced = await request(app).post(`/api/projects/${created.body.id}/tts`).expect(200);

    expect(voiced.body.cues).toHaveLength(selected.body.cues.length);
    expect(voiced.body.cues[0].ttsStatus).toBe('ready');
    expect(voiced.body.cues[1]).toMatchObject({
      ttsStatus: 'failed',
      ttsError: '두 번째 문장 생성 실패',
    });
    expect(voiced.body.cues.slice(2).every((cue: {ttsStatus: string}) => cue.ttsStatus === 'ready'))
      .toBe(true);
  });

  it('TTS 생성 중에는 미디어 플랜을 만들지 않는다', async () => {
    const app = createApp({database: createDatabase(':memory:'), ttsProvider: readyTtsProvider});
    const created = await request(app)
      .post('/api/projects')
      .send({name: '생성 잠금', runtimeMinutes: 30, dwellPresetId: 'short'})
      .expect(201);
    const candidates = await request(app)
      .post(`/api/projects/${created.body.id}/candidates`)
      .send({
        mode: 'reference',
        title: '생성 중인 음성',
        summary: '음성이 생성되는 동안 시각 설계를 잠그기 위한 이야기입니다.',
      })
      .expect(200);
    const selected = await request(app)
      .post(`/api/projects/${created.body.id}/candidates/${candidates.body[0].id}/select`)
      .expect(200);
    selected.body.cues[0].ttsStatus = 'generating';
    await request(app)
      .post('/api/projects/import')
      .send({manifest: JSON.stringify(selected.body)})
      .expect(201);

    const blocked = await request(app)
      .post(`/api/projects/${created.body.id}/media-plan`)
      .expect(409);
    expect(blocked.body.error).toContain('음성 생성');
  });

  it('모든 실제 음성이 준비되면 그 재생시간으로 미디어 플랜을 끝낸다', async () => {
    const app = createApp({database: createDatabase(':memory:'), ttsProvider: readyTtsProvider});
    const created = await request(app)
      .post('/api/projects')
      .send({name: '실제 길이', runtimeMinutes: 60, dwellPresetId: 'immersive'})
      .expect(201);
    const candidates = await request(app)
      .post(`/api/projects/${created.body.id}/candidates`)
      .send({
        mode: 'reference',
        title: '실제 길이의 이야기',
        summary: '예상 분량보다 실제 음성 길이를 우선해 화면을 배치하는 이야기입니다.',
      })
      .expect(200);
    await request(app)
      .post(`/api/projects/${created.body.id}/candidates/${candidates.body[0].id}/select`)
      .expect(200);
    const voiced = await request(app).post(`/api/projects/${created.body.id}/tts`).expect(200);
    const planned = await request(app)
      .post(`/api/projects/${created.body.id}/media-plan`)
      .expect(200);
    const lastCue = voiced.body.cues.at(-1);
    const expectedEnd = lastCue.end + (lastCue.manualGap ?? lastCue.gapAfter);

    expect(planned.body.mediaSegments.at(-1).end).toBeCloseTo(expectedEnd, 3);
  });
});
