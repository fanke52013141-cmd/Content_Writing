import type { LocalUser } from '@content-writing/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from './local-user.repository.js';
import { PinHasher } from './pin-hasher.js';

describe('local identity API', () => {
  let app: NestFastifyApplication;
  let repository: InMemoryLocalUserRepository;

  beforeAll(async () => {
    repository = new InMemoryLocalUserRepository(new Date('2026-07-18T00:00:00.000Z'));
    app = await createApp({
      localUserRepository: repository,
      generationRepository: new InMemoryGenerationRepository(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the single local user without credential material', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/me' });
    const body = response.json<LocalUser & { pinHash?: string }>();

    expect(response.statusCode).toBe(200);
    expect(body.displayName).toBe('本地创作者');
    expect(body.pinEnabled).toBe(false);
    expect(body.pinHash).toBeUndefined();
  });

  it('updates and trims the local display name', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { displayName: '  我的内容工作室  ' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<LocalUser>().displayName).toBe('我的内容工作室');
  });

  it('rejects malformed updates through the common error envelope', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { displayName: '', role: 'admin' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
  });

  it('stores a derived PIN hash and never returns it', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/pin',
      payload: { pin: '123456' },
    });
    const stored = await repository.get();

    expect(response.statusCode).toBe(200);
    expect(response.json<LocalUser & { pinHash?: string }>()).toMatchObject({ pinEnabled: true });
    expect(response.json<{ pinHash?: string }>().pinHash).toBeUndefined();
    expect(stored.pinHash).not.toBe('123456');
    await expect(new PinHasher().verify('123456', stored.pinHash ?? '')).resolves.toBe(true);
  });
});
