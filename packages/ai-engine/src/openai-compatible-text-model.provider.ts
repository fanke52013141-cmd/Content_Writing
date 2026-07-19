import type {
  ModelCapabilities,
  ModelEvent,
  ModelRequest,
  TextModelProvider,
} from '@content-writing/contracts';

interface OpenAiChoice {
  delta?: { content?: unknown };
  message?: { content?: unknown };
  finish_reason?: unknown;
}

interface OpenAiResponse {
  id?: unknown;
  choices?: OpenAiChoice[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function endpointFor(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/u, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function parseResponse(value: unknown): OpenAiResponse {
  if (!value || typeof value !== 'object')
    throw new Error('Model provider returned a non-object response.');
  return value;
}

function completionEvent(response: OpenAiResponse): ModelEvent {
  const usage = response.usage;
  return {
    type: 'completed',
    finishReason: 'stop',
    ...(usage?.prompt_tokens !== undefined && usage?.completion_tokens !== undefined
      ? {
          usage: {
            inputTokens: tokenCount(usage.prompt_tokens) ?? 0,
            outputTokens: tokenCount(usage.completion_tokens) ?? 0,
          },
        }
      : {}),
  };
}

export interface OpenAiCompatibleProviderOptions {
  key: string;
  baseUrl: string;
  apiKey?: string | null;
  defaultModel?: string;
  fetchFn?: typeof fetch;
}

/** OpenAI-compatible chat completions, including OpenRouter/NewAPI relays. */
export class OpenAiCompatibleTextModelProvider implements TextModelProvider {
  readonly key: string;
  private readonly endpoint: string;
  private readonly apiKey: string | null;
  private readonly defaultModel: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenAiCompatibleProviderOptions) {
    if (!options.key.trim()) throw new Error('Provider key is required.');
    this.key = options.key;
    this.endpoint = endpointFor(options.baseUrl);
    this.apiKey = options.apiKey?.trim() || null;
    this.defaultModel = options.defaultModel?.trim() || undefined;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  capabilities(model: string): Promise<ModelCapabilities> {
    return Promise.resolve({
      provider: this.key,
      model: model || this.defaultModel || 'unknown',
      streaming: true,
      structuredOutput: false,
      maxInputTokens: 128_000,
      maxOutputTokens: 65_536,
    });
  }

  async *generate(request: ModelRequest): AsyncIterable<ModelEvent> {
    const model = request.model || this.defaultModel;
    if (!model) {
      yield {
        type: 'failed',
        code: 'MODEL_REQUIRED',
        message: 'No model is configured for this provider.',
        retryable: false,
      };
      return;
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          temperature: request.temperature,
          ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
        }),
      });
    } catch (error) {
      yield {
        type: 'failed',
        code: 'MODEL_NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Model provider request failed.',
        retryable: true,
      };
      return;
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 2_000);
      yield {
        type: 'failed',
        code: `MODEL_HTTP_${response.status}`,
        message: detail || `Model provider returned HTTP ${response.status}.`,
        retryable: response.status >= 500 || response.status === 429,
      };
      return;
    }

    yield { type: 'started', providerRequestId: response.headers.get('x-request-id') ?? undefined };
    if (!response.body) {
      try {
        const json = parseResponse(await response.json());
        const content = json.choices?.[0]?.message?.content;
        if (typeof content === 'string' && content) yield { type: 'delta', text: content };
        yield completionEvent(json);
      } catch (error) {
        yield {
          type: 'failed',
          code: 'MODEL_RESPONSE_INVALID',
          message: error instanceof Error ? error.message : 'Model response could not be parsed.',
          retryable: false,
        };
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    let latestUsage: OpenAiResponse['usage'];
    const consume = (raw: string): ModelEvent | null => {
      const data = raw
        .split(/\r?\n/u)
        .find((line) => line.startsWith('data:'))
        ?.slice(5)
        .trim();
      if (!data || data === '[DONE]')
        return data === '[DONE]' ? completionEvent({ usage: latestUsage }) : null;
      try {
        const json = parseResponse(JSON.parse(data));
        latestUsage = json.usage ?? latestUsage;
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) return { type: 'delta', text: delta };
        const finishReason = json.choices?.[0]?.finish_reason;
        if (typeof finishReason === 'string' && finishReason)
          return {
            type: 'completed',
            finishReason,
            ...(latestUsage
              ? {
                  usage: {
                    inputTokens: tokenCount(latestUsage.prompt_tokens) ?? 0,
                    outputTokens: tokenCount(latestUsage.completion_tokens) ?? 0,
                  },
                }
              : {}),
          };
        return null;
      } catch {
        return {
          type: 'failed',
          code: 'MODEL_RESPONSE_INVALID',
          message: 'Model stream contained invalid JSON.',
          retryable: false,
        };
      }
    };
    try {
      while (!finished) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
        const frames = buffer.split(/\r?\n\r?\n/u);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const event = consume(frame);
          if (!event) continue;
          yield event;
          if (event.type === 'completed' || event.type === 'failed') finished = true;
        }
        if (chunk.done) break;
      }
      if (!finished) {
        const event = consume(buffer);
        if (event) yield event;
        if (!event || (event.type !== 'completed' && event.type !== 'failed'))
          yield completionEvent({ usage: latestUsage });
      }
    } finally {
      reader.releaseLock();
    }
  }

  healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return Promise.resolve({
      ok: true,
      detail: `chat completions endpoint configured at ${this.endpoint}`,
    });
  }
}
