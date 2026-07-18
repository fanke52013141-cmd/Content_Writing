import type { Generation } from '@content-writing/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryGenerationRepository } from './generation.repository.js';

describe('generation command API', () => {
  let app: NestFastifyApplication;
  let generationId: string;

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a queued trace with safe mock defaults', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/generations',
      payload: {
        capabilityKey: 'article.write',
        input: { topic: '本地 AI 工具' },
      },
    });
    const generation = response.json<Generation>();
    generationId = generation.id;

    expect(response.statusCode).toBe(202);
    expect(generation).toMatchObject({
      capabilityKey: 'article.write',
      providerKey: 'mock',
      model: 'mock-writer',
      status: 'queued',
      outputText: null,
    });
  });

  it('reads the trace without returning input or prompt bodies', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/generations/${generationId}`,
    });
    const body = response.json<Record<string, unknown>>();

    expect(response.statusCode).toBe(200);
    expect(body.id).toBe(generationId);
    expect(body).not.toHaveProperty('inputSnapshot');
    expect(body).not.toHaveProperty('systemPrompt');
  });

  it('rejects unknown command fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/generations',
      payload: {
        capabilityKey: 'article.write',
        input: {},
        makeCurrent: true,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
  });

  it('returns a traceable 404 for missing generations', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/generations/019f754a-c6d8-7fa2-a3c8-000000000000',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });
});
