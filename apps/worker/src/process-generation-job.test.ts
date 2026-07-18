import type { ModelEvent, TextModelProvider } from '@content-writing/contracts';
import { MockTextModelProvider, ProviderRegistry } from '@content-writing/ai-engine';
import { describe, expect, it } from 'vitest';

import type { GenerationTraceWriter } from './generation-trace-writer.js';
import { processGenerationJob } from './process-generation-job.js';

class MemoryTraceWriter implements GenerationTraceWriter {
  readonly calls: string[] = [];
  readonly events: ModelEvent[] = [];
  output = '';

  markRunning(): Promise<void> {
    this.calls.push('running');
    return Promise.resolve();
  }

  appendEvent(_generationId: string, sequence: number, event: ModelEvent): Promise<void> {
    this.calls.push(`event:${sequence}:${event.type}`);
    this.events.push(event);
    return Promise.resolve();
  }

  markSucceeded(_generationId: string, outputText: string): Promise<void> {
    this.calls.push('succeeded');
    this.output = outputText;
    return Promise.resolve();
  }

  markFailed(_generationId: string, code: string): Promise<void> {
    this.calls.push(`failed:${code}`);
    return Promise.resolve();
  }
}

const generationId = '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7';
const validJob = {
  generationId,
  providerKey: 'mock',
  request: {
    generationId,
    capabilityKey: 'article.write',
    systemPrompt: 'Write a candidate.',
    userPrompt: 'Topic: local AI tools',
    model: 'mock-writer',
  },
};

describe('generation worker processor', () => {
  it('persists stream events in order before marking success', async () => {
    const registry = new ProviderRegistry();
    registry.register(new MockTextModelProvider({ output: '候选正文', chunkSize: 2 }));
    const writer = new MemoryTraceWriter();

    await expect(processGenerationJob(validJob, registry, writer)).resolves.toEqual({
      output: '候选正文',
    });
    expect(writer.output).toBe('候选正文');
    expect(writer.calls).toEqual([
      'running',
      'event:0:started',
      'event:1:delta',
      'event:2:delta',
      'event:3:completed',
      'succeeded',
    ]);
  });

  it('validates the job before mutating the trace', async () => {
    const registry = new ProviderRegistry();
    registry.register(new MockTextModelProvider());
    const writer = new MemoryTraceWriter();

    await expect(
      processGenerationJob(
        { ...validJob, generationId: '029f754a-c6d8-7fa2-a3c8-1f1c2e2837a7' },
        registry,
        writer,
      ),
    ).rejects.toThrow('generation IDs must match');
    expect(writer.calls).toEqual([]);
  });

  it('marks provider failures with their provider error code', async () => {
    const failingProvider: TextModelProvider = {
      key: 'failing',
      capabilities: () =>
        Promise.resolve({
          provider: 'failing',
          model: 'failure-model',
          streaming: true,
          structuredOutput: false,
        }),
      generate: async function* (): AsyncIterable<ModelEvent> {
        await Promise.resolve();
        yield { type: 'started' };
        yield { type: 'failed', code: 'RATE_LIMITED', message: 'Try later', retryable: true };
      },
      healthCheck: () => Promise.resolve({ ok: false }),
    };
    const registry = new ProviderRegistry();
    registry.register(failingProvider);
    const writer = new MemoryTraceWriter();

    await expect(
      processGenerationJob({ ...validJob, providerKey: 'failing' }, registry, writer),
    ).rejects.toThrow('Try later');
    expect(writer.calls).toContain('failed:RATE_LIMITED');
    expect(writer.calls).not.toContain('failed:WORKER_EXECUTION_FAILED');
  });
});
