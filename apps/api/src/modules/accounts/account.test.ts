import type { Account, AccountProfileVersion } from '@content-writing/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryAccountRepository } from './account.repository.js';

const completeProfile = {
  positioningStatement: '帮助个人公众号创作者建立稳定的内容生产系统',
  targetAudience: '独立运营 1–3 个公众号的个人创作者',
  valueProposition: '提供可追溯、可执行的内容创作方法',
  contentPillars: ['账号定位', '选题方法', '写作系统'],
  toneKeywords: ['清晰', '克制', '实用'],
  writingStyle: '先给结论，再解释理由；使用短段落。',
  contentBoundaries: '不虚构事实，不使用未知授权图片。',
  versionNote: '首版定位',
};

describe('account and profile API', () => {
  let app: NestFastifyApplication;
  let accountId: string;
  let firstProfileId: string;

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, lists and archives/restores an account', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: '  墨流实验室  ', description: '个人内容账号' },
    });
    const account = created.json<Account>();
    accountId = account.id;

    expect(created.statusCode).toBe(201);
    expect(account).toMatchObject({ name: '墨流实验室', status: 'active' });
    const listed = await app.inject({ method: 'GET', url: '/api/v1/accounts' });
    expect(listed.json<Account[]>()).toHaveLength(1);

    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/v1/accounts/${accountId}`,
      payload: { status: 'archived' },
    });
    expect(archived.json<Account>().archivedAt).not.toBeNull();

    const restored = await app.inject({
      method: 'PATCH',
      url: `/api/v1/accounts/${accountId}`,
      payload: { status: 'active' },
    });
    expect(restored.json<Account>()).toMatchObject({ status: 'active', archivedAt: null });
  });

  it('creates and edits a manual profile draft', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/profile-versions`,
      payload: { ...completeProfile, positioningStatement: '' },
    });
    const profile = created.json<AccountProfileVersion>();
    firstProfileId = profile.id;

    expect(created.statusCode).toBe(201);
    expect(profile).toMatchObject({ versionNumber: 1, status: 'draft', source: 'manual' });

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/v1/accounts/${accountId}/profile-versions/${firstProfileId}`,
      payload: completeProfile,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<AccountProfileVersion>().positioningStatement).toContain('稳定');
  });

  it('activates a complete draft without auto-overwriting it later', async () => {
    const activated = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/profile-versions/${firstProfileId}/activate`,
    });
    expect(activated.statusCode).toBe(201);
    expect(activated.json<AccountProfileVersion>().status).toBe('active');

    const overwrite = await app.inject({
      method: 'PUT',
      url: `/api/v1/accounts/${accountId}/profile-versions/${firstProfileId}`,
      payload: { ...completeProfile, positioningStatement: '覆盖已激活定位' },
    });
    expect(overwrite.statusCode).toBe(409);
    expect(overwrite.json<{ error: { code: string } }>().error.code).toBe('CONFLICT');
  });

  it('historicalizes the old profile only when the user activates a new one', async () => {
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/profile-versions`,
      payload: { ...completeProfile, versionNote: '调整后的定位' },
    });
    const secondProfile = second.json<AccountProfileVersion>();

    const beforeAcceptance = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/profile-versions`,
    });
    expect(
      beforeAcceptance
        .json<AccountProfileVersion[]>()
        .find((profile) => profile.id === firstProfileId)?.status,
    ).toBe('active');

    await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/profile-versions/${secondProfile.id}/activate`,
    });
    const afterAcceptance = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}/profile-versions`,
    });
    const profiles = afterAcceptance.json<AccountProfileVersion[]>();

    expect(profiles.filter((profile) => profile.status === 'active')).toHaveLength(1);
    expect(profiles.find((profile) => profile.id === firstProfileId)?.status).toBe('historical');
    expect(profiles.find((profile) => profile.id === secondProfile.id)?.status).toBe('active');
  });

  it('blocks incomplete activation and rejects client-controlled lifecycle fields', async () => {
    const incomplete = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/profile-versions`,
      payload: { ...completeProfile, targetAudience: '' },
    });
    const profile = incomplete.json<AccountProfileVersion>();
    const activation = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/profile-versions/${profile.id}/activate`,
    });
    expect(activation.statusCode).toBe(400);

    const forged = await app.inject({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/profile-versions`,
      payload: { ...completeProfile, status: 'active' },
    });
    expect(forged.statusCode).toBe(400);
  });
});
