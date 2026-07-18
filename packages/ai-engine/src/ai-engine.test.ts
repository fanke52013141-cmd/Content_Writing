import type { ModelEvent, TextModelProvider } from '@content-writing/contracts';
import { describe, expect, it } from 'vitest';

import { executeGeneration } from './execute-generation.js';
import { MockTextModelProvider } from './mock-text-model.provider.js';
import { ProviderRegistry } from './provider-registry.js';

const validRequest = {
  generationId: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
  capabilityKey: 'article.write',
  systemPrompt: 'Return a candidate only.',
  userPrompt: 'Write a test article.',
  model: 'mock-writer',
};

describe('AI engine', () => {
  it('registers and resolves providers without leaking implementation details', () => {
    const registry = new ProviderRegistry();
    const provider = new MockTextModelProvider();
    registry.register(provider);

    expect(registry.list()).toEqual(['mock']);
    expect(registry.get('mock')).toBe(provider);
    expect(() => registry.get('missing')).toThrow('not registered');
  });

  it('rejects duplicate provider keys', () => {
    const registry = new ProviderRegistry();
    registry.register(new MockTextModelProvider());
    expect(() => registry.register(new MockTextModelProvider())).toThrow('already registered');
  });

  it('streams and reconstructs a deterministic candidate output', async () => {
    const registry = new ProviderRegistry();
    registry.register(new MockTextModelProvider({ output: '候选文章版本', chunkSize: 2 }));

    const result = await executeGeneration(registry, 'mock', validRequest);

    expect(result.output).toBe('候选文章版本');
    expect(result.events[0]).toMatchObject({ type: 'started' });
    expect(result.events.at(-1)).toMatchObject({ type: 'completed', finishReason: 'stop' });
    expect(result.events.filter((event) => event.type === 'delta')).toHaveLength(3);
  });

  it('rejects provider streams without a terminal event', async () => {
    const brokenProvider: TextModelProvider = {
      key: 'broken',
      capabilities: () =>
        Promise.resolve({
          provider: 'broken',
          model: 'broken',
          streaming: true,
          structuredOutput: false,
        }),
      generate: async function* (): AsyncIterable<ModelEvent> {
        await Promise.resolve();
        yield { type: 'delta', text: 'partial' };
      },
      healthCheck: () => Promise.resolve({ ok: false }),
    };
    const registry = new ProviderRegistry();
    registry.register(brokenProvider);

    await expect(executeGeneration(registry, 'broken', validRequest)).rejects.toThrow(
      'without a terminal event',
    );
  });
});
