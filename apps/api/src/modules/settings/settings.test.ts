import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryAccountRepository } from '../accounts/account.repository.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryMaterialRepository } from '../materials/material.repository.js';
import { InMemoryProjectRepository } from '../projects/project.repository.js';
import { InMemoryTopicRepository } from '../topics/topic.repository.js';

describe('prompt and model settings API', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
      projectRepository: new InMemoryProjectRepository(),
      topicRepository: new InMemoryTopicRepository(),
      materialRepository: new InMemoryMaterialRepository(),
    });
  });
  afterAll(async () => app.close());

  it('keeps prompt versions immutable and activates only after explicit action', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/prompts',
      payload: { capabilityKey: 'article.write', name: '我的文章提示词', body: '写一篇文章' },
    });
    expect(created.statusCode).toBe(201);
    const prompt = created.json<{ id: string; versions: Array<{ id: string; status: string }> }>();
    expect(prompt.versions[0]?.status).toBe('draft');
    const activated = await app.inject({
      method: 'POST',
      url: `/api/v1/prompts/${prompt.id}/versions/${prompt.versions[0]!.id}/activate`,
      payload: { isDefault: true },
    });
    expect(activated.statusCode).toBe(201);
    expect(
      activated.json<{ versions: Array<{ status: string; isDefault: boolean }> }>().versions[0],
    ).toMatchObject({ status: 'active', isDefault: true });
  });

  it('stores provider keys without returning them', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/model-providers',
      payload: {
        name: '本地中转',
        kind: 'newapi',
        baseUrl: 'https://example.com/v1',
        model: 'demo',
        apiKey: 'secret-key',
        enabled: true,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: '本地中转', apiKeySet: true });
    expect(created.json()).not.toHaveProperty('apiKey');
  });
});
