import {describe, expect, it, vi} from 'vitest';
import {z} from 'zod';
import {OpenAiCompatibleLlmProvider} from '../src/server/llm-provider';

describe('OpenAI-compatible LLM provider', () => {
  it('JSON 응답을 스키마로 검증하고 코드 펜스를 제거한다', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {messages: Array<{content: string}>};
      expect(body.messages[1].content).toContain('입력 데이터');
      expect(body.messages[0].content).toContain('"answer"');
      return new Response(
        JSON.stringify({
          choices: [{message: {content: '```json\n{"answer":"완료"}\n```'}}],
        }),
        {status: 200, headers: {'Content-Type': 'application/json'}},
      );
    });
    const provider = new OpenAiCompatibleLlmProvider(
      {baseUrl: 'https://llm.example/v1', apiKey: 'secret', model: 'story-model'},
      fetchImpl,
    );

    const result = await provider.generate({
      pass: 'hook',
      instructions: '후킹을 설계한다.',
      input: {title: '빈 목탁'},
      schema: z.object({answer: z.string()}),
    });

    expect(result).toEqual({answer: '완료'});
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(provider.status().status).toBe('ready');
  });

  it('필수 설정이 없으면 연결 전 상태를 반환하고 호출을 거부한다', async () => {
    const provider = new OpenAiCompatibleLlmProvider({baseUrl: '', apiKey: '', model: ''});
    expect(provider.status().status).toBe('disconnected');
    await expect(
      provider.generate({
        pass: 'hook',
        instructions: '후킹을 설계한다.',
        input: {},
        schema: z.object({answer: z.string()}),
      }),
    ).rejects.toThrow('LLM 설정');
  });
});
