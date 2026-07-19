import { describe, expect, it } from 'vitest';

import { OpenAiCompatibleTextModelProvider } from './openai-compatible-text-model.provider.js';

const request = {
  generationId: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
  capabilityKey: 'article.write',
  systemPrompt: 'system',
  userPrompt: 'user',
  model: 'demo',
  temperature: 0.4,
  metadata: {},
} as const;

describe('OpenAI-compatible provider', () => {
  it('streams deltas and terminal usage from an SSE response', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"id":"req-1","choices":[{"delta":{"content":"你好"}}]}\n\n',
          ),
        );
        controller.enqueue(
          new TextEncoder().encode('data: {"choices":[{"delta":{"content":"世界"}}]}\n\n'),
        );
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const provider = new OpenAiCompatibleTextModelProvider({
      key: 'relay',
      baseUrl: 'https://relay.example/v1',
      apiKey: 'secret',
      fetchFn: (_input, init) => {
        expect(init?.method).toBe('POST');
        expect((init?.headers as Record<string, string>).authorization).toBe('Bearer secret');
        const requestBody = typeof init?.body === 'string' ? init.body : '';
        expect(requestBody).toContain('"model":"demo"');
        return Promise.resolve(
          new Response(body, { status: 200, headers: { 'x-request-id': 'req-1' } }),
        );
      },
    });
    const events = [];
    for await (const event of provider.generate(request)) events.push(event);
    expect(events).toEqual([
      { type: 'started', providerRequestId: 'req-1' },
      { type: 'delta', text: '你好' },
      { type: 'delta', text: '世界' },
      { type: 'completed', finishReason: 'stop' },
    ]);
  });

  it('turns HTTP failures into retryable model events', async () => {
    const provider = new OpenAiCompatibleTextModelProvider({
      key: 'relay',
      baseUrl: 'https://relay.example/v1/chat/completions',
      fetchFn: () => Promise.resolve(new Response('busy', { status: 503 })),
    });
    const events = [];
    for await (const event of provider.generate(request)) events.push(event);
    expect(events).toEqual([
      { type: 'failed', code: 'MODEL_HTTP_503', message: 'busy', retryable: true },
    ]);
  });
});
