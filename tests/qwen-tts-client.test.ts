import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {
  QwenTtsClient,
  createQwenTtsConfig,
  parseGradioSse,
} from '../src/server/qwen-tts-client';

describe('Qwen3 TTS Gradio client', () => {
  it('환경변수가 없으면 한국어 고정 화자 설정을 사용한다', () => {
    expect(createQwenTtsConfig({})).toEqual({
      baseUrl: 'http://127.0.0.1:7860',
      speaker: 'Sohee',
      modelSize: '1.7B',
      seed: 42,
      instruction: '차분하고 생생한 한국어 이야기꾼처럼, 문장 끝을 서두르지 말고 또렷하게 낭독하세요.',
    });
  });

  it('Gradio 완료 이벤트에서 오디오 파일 정보를 읽는다', () => {
    const result = parseGradioSse([
      'event: heartbeat',
      'data: null',
      '',
      'event: complete',
      'data: [{"path":"/tmp/generated.wav","url":"/gradio_api/file=generated.wav","mime_type":"audio/wav"},"완료"]',
      '',
    ].join('\n'));

    expect(result.url).toBe('/gradio_api/file=generated.wav');
    expect(result.path).toBe('/tmp/generated.wav');
  });

  it('작업을 제출하고 완료된 오디오를 지정한 경로에 저장한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yadam-qwen-'));
    const destinationPath = join(directory, 'cue-001.wav');
    const audioBytes = Uint8Array.from([82, 73, 70, 70, 1, 2, 3, 4]);
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({event_id: 'evt-1'}), {status: 200}))
      .mockResolvedValueOnce(new Response([
        'event: complete',
        'data: [{"path":"/tmp/generated.wav","url":"/gradio_api/file=generated.wav","mime_type":"audio/wav"},"완료"]',
        '',
      ].join('\n'), {status: 200}))
      .mockResolvedValueOnce(new Response(audioBytes, {status: 200}));
    const client = new QwenTtsClient(createQwenTtsConfig({}), fetchImpl);

    const result = await client.generate({text: '옛날 한양에 기이한 일이 있었습니다.', destinationPath});

    expect(result.path).toBe(destinationPath);
    expect(Array.from(await readFile(destinationPath))).toEqual(Array.from(audioBytes));
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:7860/gradio_api/call/generate_custom_voice',
      expect.objectContaining({method: 'POST'}),
    );
    const submitted = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as {data: unknown[]};
    expect(submitted.data).toEqual([
      '옛날 한양에 기이한 일이 있었습니다.',
      'Korean',
      'Sohee',
      '차분하고 생생한 한국어 이야기꾼처럼, 문장 끝을 서두르지 말고 또렷하게 낭독하세요.',
      '1.7B',
      42,
    ]);
  });

  it('공개 생성 엔드포인트가 있으면 준비 상태로 판단한다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({named_endpoints: {'/generate_custom_voice': {}}}), {status: 200}),
    );
    const client = new QwenTtsClient(createQwenTtsConfig({}), fetchImpl);

    await expect(client.checkReady()).resolves.toBe(true);
  });
});
