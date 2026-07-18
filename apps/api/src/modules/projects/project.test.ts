import type { ContentProject } from '@content-writing/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryAccountRepository } from '../accounts/account.repository.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryProjectRepository } from './project.repository.js';
import { InMemoryTopicRepository } from '../topics/topic.repository.js';

const accountOne = '019f754a-c6d8-7fa2-a3c8-111111111111';
const accountTwo = '019f754a-c6d8-7fa2-a3c8-222222222222';

describe('content project API', () => {
  let app: NestFastifyApplication;
  let projectId: string;

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
      projectRepository: new InMemoryProjectRepository(
        new Map([
          [accountOne, '账号一'],
          [accountTwo, '账号二'],
        ]),
      ),
      topicRepository: new InMemoryTopicRepository(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a project with an explicit origin and optional primary account', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: {
        title: 'AI 本地创作工具为什么值得做',
        creationOrigin: 'idea',
        originNote: '从自己的使用痛点开始',
        primaryAccountId: accountOne,
      },
    });
    const project = response.json<ContentProject>();
    projectId = project.id;

    expect(response.statusCode).toBe(201);
    expect(project).toMatchObject({
      status: 'active',
      creationOrigin: 'idea',
      accountLinks: [{ accountId: accountOne, accountName: '账号一', isPrimary: true }],
    });
  });

  it('does not expose or accept a mandatory workflow step', async () => {
    const forged = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { title: '错误项目', creationOrigin: 'blank', currentStep: 1 },
    });
    expect(forged.statusCode).toBe(400);

    const listed = await app.inject({ method: 'GET', url: '/api/v1/projects' });
    const project = listed.json<ContentProject[]>()[0];
    expect(project).not.toHaveProperty('currentStep');
    expect(project).not.toHaveProperty('requiredNextStep');
  });

  it('switches the single primary account without deleting old links', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/accounts`,
      payload: { accountId: accountTwo, isPrimary: true },
    });
    const project = response.json<ContentProject>();

    expect(response.statusCode).toBe(200);
    expect(project.accountLinks).toHaveLength(2);
    expect(project.accountLinks.filter((link) => link.isPrimary)).toEqual([
      { accountId: accountTwo, accountName: '账号二', isPrimary: true },
    ]);
  });

  it('unlinks context without deleting reusable objects', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/accounts/${accountOne}`,
    });
    const project = response.json<ContentProject>();

    expect(response.statusCode).toBe(200);
    expect(project.accountLinks.map((link) => link.accountId)).not.toContain(accountOne);
  });

  it('changes completion only through an explicit user action and supports archive recovery', async () => {
    const completed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      payload: { status: 'completed' },
    });
    expect(completed.json<ContentProject>().completedAt).not.toBeNull();

    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      payload: { status: 'archived' },
    });
    expect(archived.json<ContentProject>().archivedAt).not.toBeNull();

    const restored = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      payload: { status: 'active' },
    });
    expect(restored.json<ContentProject>()).toMatchObject({
      status: 'active',
      archivedAt: null,
      completedAt: null,
    });
  });
});
