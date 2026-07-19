import type { ExternalSearchProviderItem, HotTopicProviderItem } from '@content-writing/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryAccountRepository } from '../accounts/account.repository.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryMaterialRepository } from '../materials/material.repository.js';
import { InMemoryProjectRepository } from '../projects/project.repository.js';
import { InMemoryTopicRepository } from '../topics/topic.repository.js';
import { InMemoryDiscoveryRepository } from './discovery.repository.js';
import { StaticHotTopicProvider, StaticSearchProvider } from './external.providers.js';

const hotItem: HotTopicProviderItem = {
  externalId: 'douyin-1',
  source: 'douyin',
  title: '今日热点',
  url: 'https://www.douyin.com/video/1',
  description: '摘要',
  popularity: 1000,
  observedAt: '2026-07-18T00:00:00.000Z',
};
const searchItem: ExternalSearchProviderItem = {
  title: '外部资料',
  url: 'https://example.com/research',
  snippet: '摘要',
  domain: 'example.com',
  publishedAt: null,
};

describe('discovery API', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
      projectRepository: new InMemoryProjectRepository(),
      topicRepository: new InMemoryTopicRepository(),
      materialRepository: new InMemoryMaterialRepository(),
      discoveryRepository: new InMemoryDiscoveryRepository(),
      hotTopicProvider: new StaticHotTopicProvider([hotItem]),
      searchProvider: new StaticSearchProvider([searchItem]),
    });
  });

  afterAll(async () => app.close());

  it('requires per-source approval before network-backed discovery', async () => {
    const policies = await app.inject({ method: 'GET', url: '/api/v1/discovery/sources' });
    expect(policies.statusCode).toBe(200);
    const douyin = policies
      .json<Array<{ id: string; sourceKey: string }>>()
      .find((policy) => policy.sourceKey === 'douyin');
    expect(douyin).toBeDefined();

    const blocked = await app.inject({
      method: 'GET',
      url: '/api/v1/discovery/hot-topics?source=douyin&limit=10',
    });
    expect(blocked.statusCode).toBe(403);

    const approved = await app.inject({
      method: 'PATCH',
      url: `/api/v1/discovery/sources/${douyin!.id}`,
      payload: { termsReviewStatus: 'approved', enabled: true, reviewNote: '已核对来源条款' },
    });
    expect(approved.statusCode).toBe(200);

    const refreshed = await app.inject({
      method: 'GET',
      url: '/api/v1/discovery/hot-topics?source=douyin&limit=10',
    });
    expect(refreshed.statusCode).toBe(200);
    const refreshedItems: Array<{ title: string; source: string }> = refreshed.json();
    expect(refreshedItems[0]).toMatchObject({ title: '今日热点', source: 'douyin' });
  });

  it('converts an approved hot topic into a traceable topic and searches approved SearXNG', async () => {
    const history = await app.inject({
      method: 'GET',
      url: '/api/v1/discovery/hot-topics/history',
    });
    const historyItems: Array<{ id: string }> = history.json();
    const itemId = historyItems[0]!.id;
    const topic = await app.inject({
      method: 'POST',
      url: `/api/v1/discovery/hot-topics/${itemId}/topics`,
      payload: { keywords: ['热点'] },
    });
    expect(topic.statusCode).toBe(201);
    expect(topic.json()).toMatchObject({ source: 'hot_topic', sourceHotTopicId: itemId });

    const policies = (await app.inject({ method: 'GET', url: '/api/v1/discovery/sources' })).json<
      Array<{ id: string; sourceKey: string }>
    >();
    const searchPolicy = policies.find((policy) => policy.sourceKey === 'searxng')!;
    const approved = await app.inject({
      method: 'PATCH',
      url: `/api/v1/discovery/sources/${searchPolicy.id}`,
      payload: { termsReviewStatus: 'approved', enabled: true },
    });
    expect(approved.statusCode).toBe(200);

    const search = await app.inject({
      method: 'POST',
      url: '/api/v1/discovery/search',
      payload: { query: '内容系统', limit: 5 },
    });
    expect(search.statusCode).toBe(201);
    const searchBody: { results: Array<{ domain: string }> } = search.json();
    expect(searchBody.results[0]).toMatchObject({ domain: 'example.com' });
  });
});
