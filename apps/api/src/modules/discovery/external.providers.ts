import {
  externalSearchProviderItemSchema,
  hotTopicProviderItemSchema,
  type ExternalSearchProvider,
  type ExternalSearchProviderItem,
  type HotTopicProvider,
  type HotTopicProviderItem,
  type HotTopicSource,
} from '@content-writing/contracts';
import { z } from 'zod';

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

const dailyHotItemSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  title: z.string().trim().min(1),
  desc: z.string().optional(),
  hot: z.union([z.string(), z.number()]).optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  url: z.string().url(),
  mobileUrl: z.string().url().optional(),
});

const dailyHotResponseSchema = z.object({ data: z.array(dailyHotItemSchema).default([]) });

const searxngResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        url: z.string().url(),
        content: z.string().optional(),
        publishedDate: z.string().optional(),
      }),
    )
    .default([]),
});

function parseObservedAt(value: string | number | undefined): string {
  if (value === undefined) return new Date().toISOString();
  const numeric = typeof value === 'number' ? value : Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function parsePopularity(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && value.includes('亿')) {
    const numeric = Number(value.replaceAll(/[^\d.]/gu, '')) * 100_000_000;
    return Number.isFinite(numeric) && numeric >= 0
      ? Math.min(Math.round(numeric), 2_147_483_647)
      : undefined;
  }
  if (typeof value === 'string' && value.includes('万')) {
    const numeric = Number(value.replaceAll(/[^\d.]/gu, '')) * 10_000;
    return Number.isFinite(numeric) && numeric >= 0
      ? Math.min(Math.round(numeric), 2_147_483_647)
      : undefined;
  }
  const numeric = typeof value === 'number' ? value : Number(value.replaceAll(/[^\d.]/gu, ''));
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return Math.min(Math.round(numeric), 2_147_483_647);
}

function parsePublishedAt(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class DailyHotApiProvider implements HotTopicProvider {
  readonly key = 'dailyhot-api';

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async list(source: HotTopicSource, limit: number): Promise<readonly HotTopicProviderItem[]> {
    const response = await this.fetcher(new URL(source, `${this.baseUrl.replace(/\/$/u, '')}/`), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`DailyHotApi returned HTTP ${response.status}.`);
    const payload = dailyHotResponseSchema.parse(await response.json());
    return payload.data.slice(0, limit).map((item, index) =>
      hotTopicProviderItemSchema.parse({
        externalId: String(item.id ?? `${source}-${index + 1}-${item.title}`),
        source,
        title: item.title,
        url: item.url,
        ...(item.desc ? { description: item.desc } : {}),
        ...(parsePopularity(item.hot) === undefined
          ? {}
          : { popularity: parsePopularity(item.hot) }),
        observedAt: parseObservedAt(item.timestamp),
      }),
    );
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const response = await this.fetcher(this.baseUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok ? { ok: true } : { ok: false, detail: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export class SearxngSearchProvider implements ExternalSearchProvider {
  readonly key = 'searxng';

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async search(query: string, limit: number): Promise<readonly ExternalSearchProviderItem[]> {
    const url = new URL('search', `${this.baseUrl.replace(/\/$/u, '')}/`);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', 'zh-CN');
    url.searchParams.set('safesearch', '1');
    const response = await this.fetcher(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status}.`);
    const payload = searxngResponseSchema.parse(await response.json());
    return payload.results.slice(0, limit).map((item) =>
      externalSearchProviderItemSchema.parse({
        title: item.title,
        url: item.url,
        snippet: item.content ?? '',
        domain: new URL(item.url).hostname,
        publishedAt: parsePublishedAt(item.publishedDate),
      }),
    );
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const response = await this.fetcher(this.baseUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok ? { ok: true } : { ok: false, detail: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export class StaticHotTopicProvider implements HotTopicProvider {
  readonly key = 'static-hot-topics';
  constructor(private readonly items: readonly HotTopicProviderItem[] = []) {}
  list(source: HotTopicSource, limit: number): Promise<readonly HotTopicProviderItem[]> {
    return Promise.resolve(this.items.filter((item) => item.source === source).slice(0, limit));
  }
  healthCheck(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true });
  }
}

export class StaticSearchProvider implements ExternalSearchProvider {
  readonly key = 'static-search';
  constructor(private readonly items: readonly ExternalSearchProviderItem[] = []) {}
  search(_query: string, limit: number): Promise<readonly ExternalSearchProviderItem[]> {
    return Promise.resolve(this.items.slice(0, limit));
  }
  healthCheck(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true });
  }
}
