import type {
  ModelCapabilities,
  ModelEvent,
  ModelRequest,
  TextModelProvider,
} from '@content-writing/contracts';

export interface MockProviderOptions {
  output?: string;
  chunkSize?: number;
}

export class MockTextModelProvider implements TextModelProvider {
  readonly key = 'mock';
  private readonly output: string;
  private readonly chunkSize: number;

  constructor(options: MockProviderOptions = {}) {
    this.output = options.output ?? '这是一个可追溯的 Mock 候选版本。';
    this.chunkSize = options.chunkSize ?? 8;
    if (this.chunkSize < 1) throw new Error('Mock chunk size must be positive.');
  }

  capabilities(model: string): Promise<ModelCapabilities> {
    return Promise.resolve({
      provider: this.key,
      model,
      streaming: true,
      structuredOutput: false,
      maxInputTokens: 16_384,
      maxOutputTokens: 4_096,
    });
  }

  async *generate(request: ModelRequest): AsyncIterable<ModelEvent> {
    await Promise.resolve();
    yield { type: 'started', providerRequestId: `mock:${request.generationId}` };

    for (let offset = 0; offset < this.output.length; offset += this.chunkSize) {
      yield { type: 'delta', text: this.output.slice(offset, offset + this.chunkSize) };
    }

    yield {
      type: 'completed',
      finishReason: 'stop',
      usage: {
        inputTokens: Math.max(
          1,
          Math.ceil((request.systemPrompt.length + request.userPrompt.length) / 4),
        ),
        outputTokens: Math.max(1, Math.ceil(this.output.length / 4)),
      },
    };
  }

  healthCheck(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true });
  }
}
