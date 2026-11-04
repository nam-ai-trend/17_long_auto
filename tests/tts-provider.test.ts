import {describe, expect, it, vi} from 'vitest';
import {QwenTtsProvider} from '../src/server/providers';

describe('Qwen TTS provider', () => {
  it('Gradio 생성 결과를 실제 길이와 무음 정보로 변환한다', async () => {
    const client = {
      checkReady: vi.fn().mockResolvedValue(true),
      generate: vi.fn().mockResolvedValue({
        path: '/tmp/cue-001.wav',
        sourcePath: '/tmp/gradio.wav',
        sourceUrl: 'http://local/file.wav',
      }),
    };
    const analyze = vi.fn().mockResolvedValue({duration: 4.63, leading: 0.12, trailing: 0.2});
    const provider = new QwenTtsProvider(client, analyze);

    await expect(provider.synthesize({text: '비가 내리던 밤이었습니다.', destinationPath: '/tmp/cue-001.wav'}))
      .resolves.toEqual({
        audioPath: '/tmp/cue-001.wav',
        duration: 4.63,
        leadingSilence: 0.12,
        trailingSilence: 0.2,
      });
  });

  it('생성 엔드포인트가 응답하면 준비 상태를 반환한다', async () => {
    const provider = new QwenTtsProvider(
      {checkReady: vi.fn().mockResolvedValue(true), generate: vi.fn()},
      vi.fn(),
    );

    await expect(provider.status()).resolves.toMatchObject({status: 'ready', name: 'Qwen3 TTS'});
  });

  it('연결 점검 자체가 실패하면 오류 상태와 원인을 반환한다', async () => {
    const provider = new QwenTtsProvider(
      {checkReady: vi.fn().mockRejectedValue(new Error('잘못된 API 응답')), generate: vi.fn()},
      vi.fn(),
    );

    await expect(provider.status()).resolves.toMatchObject({
      status: 'error',
      detail: expect.stringContaining('잘못된 API 응답'),
    });
  });
});
