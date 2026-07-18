import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadEnvironment } from './config/environment.js';
import { InMemoryAccountRepository } from './modules/accounts/account.repository.js';
import { InMemoryGenerationRepository } from './modules/generations/generation.repository.js';
import { InMemoryLocalUserRepository } from './modules/identity/local-user.repository.js';
import { InMemoryProjectRepository } from './modules/projects/project.repository.js';
import { InMemoryTopicRepository } from './modules/topics/topic.repository.js';

describe('API infrastructure', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
      projectRepository: new InMemoryProjectRepository(),
      topicRepository: new InMemoryTopicRepository(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('defaults to the loopback interface', () => {
    const environment = loadEnvironment({ NODE_ENV: 'test' });
    expect(environment.host).toBe('127.0.0.1');
    expect(environment.port).toBe(3100);
  });

  it('returns a traceable health response', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const body = response.json<Record<string, string>>();

    expect(response.statusCode).toBe(200);
    expect(body.service).toBe('content-writing-api');
    expect(body.status).toBe('ok');
    expect(body.traceId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(Number.isNaN(Date.parse(body.timestamp ?? ''))).toBe(false);
  });

  it('publishes an OpenAPI document', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    const body = response.json<{ openapi: string; paths: Record<string, unknown> }>();

    expect(response.statusCode).toBe(200);
    expect(body.openapi).toMatch(/^3\./u);
    expect(body.paths).toHaveProperty('/api/v1/health');
  });

  it('uses the shared machine-readable error envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/not-found' });
    const body = response.json<{ error: { code: string; traceId: string } }>();

    expect(response.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.traceId).toMatch(/^[0-9a-f-]{36}$/u);
  });
});
