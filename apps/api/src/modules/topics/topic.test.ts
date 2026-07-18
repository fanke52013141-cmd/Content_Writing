import type { Topic } from '@content-writing/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryAccountRepository } from '../accounts/account.repository.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryProjectRepository } from '../projects/project.repository.js';
import { InMemoryTopicRepository } from './topic.repository.js';

const accountId = '019f754a-c6d8-7fa2-a3c8-111111111111';
const projectId = '019f754a-c6d8-7fa2-a3c8-333333333333';

describe('topic API', () => {
  let app: NestFastifyApplication;
  let firstTopicId: string;
  let secondTopicId: string;

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
      projectRepository: new InMemoryProjectRepository(),
      topicRepository: new InMemoryTopicRepository(
        new Set([accountId]),
        new Map([[projectId, '本地 AI 创作实践']]),
      ),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a reusable manual topic without requiring a project', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/topics',
      payload: {
        title: '个人创作者如何建立稳定的选题系统',
        angle: '从可复用的选题资产切入',
        targetAudience: '独立公众号创作者',
        contentGoal: '帮助读者开始实践',
        keywords: ['选题', '内容系统'],
      },
    });
    const topic = response.json<Topic>();
    firstTopicId = topic.id;

    expect(response.statusCode).toBe(201);
    expect(topic).toMatchObject({
      source: 'manual',
      status: 'active',
      accountId: null,
      projectLinks: [],
    });
  });

  it('rejects forged lifecycle and source fields plus unavailable account context', async () => {
    const forged = await app.inject({
      method: 'POST',
      url: '/api/v1/topics',
      payload: { title: '伪造选题', source: 'ai', status: 'archived' },
    });
    expect(forged.statusCode).toBe(400);

    const unavailableAccount = await app.inject({
      method: 'POST',
      url: '/api/v1/topics',
      payload: { title: '错误账号选题', accountId: crypto.randomUUID() },
    });
    expect(unavailableAccount.statusCode).toBe(400);
  });

  it('links topics explicitly and switches the project primary topic', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/topics',
      payload: { accountId, title: '第二个候选选题' },
    });
    secondTopicId = created.json<Topic>().id;

    const firstLink = await app.inject({
      method: 'PUT',
      url: `/api/v1/topics/${firstTopicId}/projects/${projectId}`,
      payload: { isPrimary: true },
    });
    expect(firstLink.statusCode).toBe(200);
    expect(firstLink.json<Topic>().projectLinks[0]?.isPrimary).toBe(true);

    const secondLink = await app.inject({
      method: 'PUT',
      url: `/api/v1/topics/${secondTopicId}/projects/${projectId}`,
      payload: { isPrimary: true },
    });
    expect(secondLink.statusCode).toBe(200);
    expect(secondLink.json<Topic>().projectLinks[0]?.isPrimary).toBe(true);

    const firstAfterSwitch = await app.inject({
      method: 'GET',
      url: `/api/v1/topics/${firstTopicId}`,
    });
    expect(firstAfterSwitch.json<Topic>().projectLinks[0]?.isPrimary).toBe(false);
  });

  it('ends a project relation without deleting the reusable topic', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/topics/${secondTopicId}/projects/${projectId}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<Topic>().projectLinks).toEqual([]);

    const listed = await app.inject({ method: 'GET', url: '/api/v1/topics' });
    expect(listed.json<Topic[]>().map((topic) => topic.id)).toContain(secondTopicId);
  });

  it('archives and restores a topic without losing its content', async () => {
    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/v1/topics/${firstTopicId}`,
      payload: { status: 'archived' },
    });
    expect(archived.json<Topic>().archivedAt).not.toBeNull();

    const restored = await app.inject({
      method: 'PATCH',
      url: `/api/v1/topics/${firstTopicId}`,
      payload: { status: 'active' },
    });
    expect(restored.json<Topic>()).toMatchObject({
      status: 'active',
      archivedAt: null,
      title: '个人创作者如何建立稳定的选题系统',
    });
  });
});
