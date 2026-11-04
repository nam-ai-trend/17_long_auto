import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {z, type ZodType} from 'zod';
import type {StoryPass} from '../shared/contracts';
import type {ProviderStatus} from './providers';

export type StructuredGenerationRequest<T> = {
  pass: Exclude<StoryPass, 'complete'> | 'interview';
  instructions: string;
  input: unknown;
  schema: ZodType<T>;
};

export type StructuredLlmProvider = {
  status: () => ProviderStatus;
  generate: <T>(request: StructuredGenerationRequest<T>) => Promise<T>;
};

export type LlmProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

type ChatCompletionResponse = {
  choices?: Array<{message?: {content?: string | null}}>;
  error?: {message?: string};
};

const stripJsonFence = (value: string): string =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

const chatCompletionsUrl = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

export class OpenAiCompatibleLlmProvider implements StructuredLlmProvider {
  public constructor(
    private readonly config: LlmProviderConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  public status(): ProviderStatus {
    if (!this.isConfigured()) {
      return {
        name: '장편 집필 LLM',
        status: 'disconnected',
        detail: 'LLM_BASE_URL, LLM_API_KEY, LLM_MODEL을 설정하면 실제 장편 집필을 시작합니다.',
      };
    }
    return {
      name: '장편 집필 LLM',
      status: 'ready',
      detail: `${this.config.model} 모델로 7패스 장편 집필을 수행합니다.`,
    };
  }

  public async generate<T>(request: StructuredGenerationRequest<T>): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('LLM 설정이 없습니다. LLM_BASE_URL, LLM_API_KEY, LLM_MODEL을 확인해 주세요.');
    }

    const response = await this.fetchImpl(chatCompletionsUrl(this.config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: request.pass === 'drafting' ? 0.8 : request.pass === 'interview' ? 0.7 : 0.35,
        response_format: {type: 'json_object'},
        messages: [
          {
            role: 'system',
            content: [
              '당신은 조선시대 야담 롱폼 전문 한국어 작가입니다.',
              '응답은 설명이나 마크다운 없이 유효한 JSON 객체 하나만 반환합니다.',
              `반환 JSON Schema:\n${JSON.stringify(z.toJSONSchema(request.schema))}`,
              request.instructions,
            ].join('\n'),
          },
          {
            role: 'user',
            content: `입력 데이터:\n${JSON.stringify(request.input)}`,
          },
        ],
      }),
    });

    const payload = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(`LLM 요청 실패 (${response.status}): ${payload.error?.message ?? '원인 불명'}`);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM이 비어 있는 응답을 반환했습니다.');

    try {
      return request.schema.parse(JSON.parse(stripJsonFence(content)));
    } catch (error) {
      throw new Error(
        `LLM 구조화 응답 검증 실패: ${error instanceof Error ? error.message : 'JSON 형식 오류'}`,
      );
    }
  }

  private isConfigured(): boolean {
    return Boolean(this.config.baseUrl.trim() && this.config.apiKey.trim() && this.config.model.trim());
  }
}

const loadDotenvFile = (): Record<string, string> => {
  try {
    const envPath = join(process.cwd(), '.env');
    if (!existsSync(envPath)) return {};
    const content = readFileSync(envPath, 'utf8');
    const result: Record<string, string> = {};
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const equalsIndex = line.indexOf('=');
      if (equalsIndex === -1) continue;
      const key = line.slice(0, equalsIndex).trim();
      let val = line.slice(equalsIndex + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
};

export const llmConfigFromEnvironment = (
  environment: Record<string, string | undefined> = process.env,
): LlmProviderConfig => {
  const isTest = Boolean(environment.VITEST || process.env.VITEST);
  const fileEnv = isTest ? {} : loadDotenvFile();

  return {
    baseUrl: fileEnv.LLM_BASE_URL || environment.LLM_BASE_URL || '',
    apiKey: fileEnv.LLM_API_KEY || environment.LLM_API_KEY || '',
    model: fileEnv.LLM_MODEL || environment.LLM_MODEL || '',
  };
};
