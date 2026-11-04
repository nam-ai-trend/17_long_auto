import {mkdir, rename, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

export type QwenTtsConfig = {
  baseUrl: string;
  speaker: string;
  modelSize: '0.6B' | '1.7B';
  seed: number;
  instruction: string;
};

export type QwenGenerateInput = {
  text: string;
  destinationPath: string;
};

export type QwenGeneratedFile = {
  path: string;
  sourcePath: string;
  sourceUrl: string;
};

type GradioFile = {
  path: string;
  url?: string | null;
  mime_type?: string | null;
};

const DEFAULT_INSTRUCTION =
  '차분하고 생생한 한국어 이야기꾼처럼, 문장 끝을 서두르지 말고 또렷하게 낭독하세요.';

export const createQwenTtsConfig = (
  environment: Record<string, string | undefined> = process.env,
): QwenTtsConfig => ({
  baseUrl: (environment.QWEN_TTS_BASE_URL ?? 'http://127.0.0.1:7860').replace(/\/$/, ''),
  speaker: environment.QWEN_TTS_SPEAKER ?? 'Sohee',
  modelSize: environment.QWEN_TTS_MODEL_SIZE === '0.6B' ? '0.6B' : '1.7B',
  seed: Number.isFinite(Number(environment.QWEN_TTS_SEED))
    ? Number(environment.QWEN_TTS_SEED)
    : 42,
  instruction: environment.QWEN_TTS_INSTRUCTION ?? DEFAULT_INSTRUCTION,
});

export const parseGradioSse = (body: string): GradioFile => {
  const blocks = body.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (event === 'error') throw new Error(`Qwen3 TTS 생성이 실패했습니다: ${data || '원인 불명'}`);
    if (event !== 'complete' || !data) continue;

    const parsed = JSON.parse(data) as unknown;
    const file = Array.isArray(parsed) ? parsed[0] : null;
    if (
      typeof file !== 'object' ||
      file === null ||
      !('path' in file) ||
      typeof file.path !== 'string'
    ) {
      throw new Error('Qwen3 TTS 완료 응답에 오디오 파일이 없습니다.');
    }
    return file as GradioFile;
  }
  throw new Error('Qwen3 TTS 완료 이벤트를 받지 못했습니다.');
};

export class QwenTtsClient {
  public constructor(
    private readonly config: QwenTtsConfig = createQwenTtsConfig(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  public async checkReady(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/gradio_api/info`);
      if (!response.ok) return false;
      const body = (await response.json()) as {named_endpoints?: Record<string, unknown>};
      return Boolean(body.named_endpoints?.['/generate_custom_voice']);
    } catch {
      return false;
    }
  }

  public async generate(input: QwenGenerateInput): Promise<QwenGeneratedFile> {
    const submitResponse = await this.fetchImpl(
      `${this.config.baseUrl}/gradio_api/call/generate_custom_voice`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          data: [
            input.text,
            'Korean',
            this.config.speaker,
            this.config.instruction,
            this.config.modelSize,
            this.config.seed,
          ],
        }),
      },
    );
    if (!submitResponse.ok) {
      throw new Error(`Qwen3 TTS 작업 제출 실패 (${submitResponse.status})`);
    }
    const submission = (await submitResponse.json()) as {event_id?: string};
    if (!submission.event_id) throw new Error('Qwen3 TTS가 작업 ID를 반환하지 않았습니다.');

    const eventResponse = await this.fetchImpl(
      `${this.config.baseUrl}/gradio_api/call/generate_custom_voice/${submission.event_id}`,
    );
    if (!eventResponse.ok) throw new Error(`Qwen3 TTS 결과 수신 실패 (${eventResponse.status})`);
    const remoteFile = parseGradioSse(await eventResponse.text());
    const sourceUrl = remoteFile.url
      ? new URL(remoteFile.url, `${this.config.baseUrl}/`).toString()
      : `${this.config.baseUrl}/gradio_api/file=${encodeURIComponent(remoteFile.path)}`;
    const audioResponse = await this.fetchImpl(sourceUrl);
    if (!audioResponse.ok) throw new Error(`Qwen3 TTS 오디오 다운로드 실패 (${audioResponse.status})`);

    await mkdir(dirname(input.destinationPath), {recursive: true});
    const partialPath = `${input.destinationPath}.partial-${crypto.randomUUID()}`;
    await writeFile(partialPath, Buffer.from(await audioResponse.arrayBuffer()));
    await rename(partialPath, input.destinationPath);
    return {path: input.destinationPath, sourcePath: remoteFile.path, sourceUrl};
  }
}
