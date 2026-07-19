import { describe, expect, it, vi } from 'vitest';

import { DailyHotApiProvider, SearxngSearchProvider } from './external.providers.js';

describe('external discovery providers', () => {
  it('maps DailyHotApi items into the stable hot-topic contract', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'weibo-1',
              title: '测试热点',
              desc: '#测试热点#',
              hot: '12.3万',
              timestamp: 1_750_000_000,
              url: 'https://s.weibo.com/weibo?q=test',
            },
          ],
        }),
      ),
    );
    const provider = new DailyHotApiProvider('http://dailyhot.test:6688', fetcher);
    const items = await provider.list('weibo', 10);

    expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://dailyhot.test:6688/weibo');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { accept: 'application/json' } });
    expect(items[0]).toMatchObject({
      externalId: 'weibo-1',
      source: 'weibo',
      title: '测试热点',
      popularity: 123000,
    });
  });

  it('maps SearXNG JSON results without persisting page bodies', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: '结果标题',
              url: 'https://example.com/article',
              content: '摘要内容',
              publishedDate: '2026-07-18',
            },
          ],
        }),
      ),
    );
    const provider = new SearxngSearchProvider('http://searxng.test:8080', fetcher);
    await expect(provider.search('内容系统', 5)).resolves.toEqual([
      {
        title: '结果标题',
        url: 'https://example.com/article',
        snippet: '摘要内容',
        domain: 'example.com',
        publishedAt: '2026-07-18T00:00:00.000Z',
      },
    ]);
  });
});
