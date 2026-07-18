import type { Outline } from '@content-writing/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryAccountRepository } from '../accounts/account.repository.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryMaterialRepository } from '../materials/material.repository.js';
import { InMemoryOutlineRepository } from './outline.repository.js';
import { InMemoryProjectRepository } from '../projects/project.repository.js';
import { InMemoryTopicRepository } from '../topics/topic.repository.js';

describe('outline API', () => {
  const outlineRepository = new InMemoryOutlineRepository();
  let app: Awaited<ReturnType<typeof createApp>>;
  let outlineId = '';

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
      projectRepository: new InMemoryProjectRepository(),
      topicRepository: new InMemoryTopicRepository(),
      materialRepository: new InMemoryMaterialRepository(),
      outlineRepository,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a structured independent outline and preserves sections', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/outlines',
      payload: {
        title: '从问题到方法',
        summary: '一篇可执行的文章',
        sections: [
          {
            heading: '开场',
            purpose: '提出问题',
            keyPoints: ['真实场景'],
            evidenceMaterialIds: [],
          },
          { heading: '方法', purpose: '给出步骤', keyPoints: ['步骤一'], evidenceMaterialIds: [] },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    const outline = response.json<Outline>();
    outlineId = outline.id;
    expect(outline.sections).toHaveLength(2);
    expect(outline.source).toBe('manual');
    expect(outline.projectId).toBeNull();
  });

  it('archives and restores an outline without losing its structure', async () => {
    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/v1/outlines/${outlineId}`,
      payload: { status: 'archived' },
    });
    const archivedOutline = archived.json<Outline>();
    expect(archivedOutline.status).toBe('archived');
    expect(Array.isArray(archivedOutline.sections)).toBe(true);

    const restored = await app.inject({
      method: 'PATCH',
      url: `/api/v1/outlines/${outlineId}`,
      payload: { status: 'active', title: '从问题到方法（修订）' },
    });
    expect(restored.json<Outline>()).toMatchObject({
      status: 'active',
      title: '从问题到方法（修订）',
    });
  });

  it('rejects unavailable project or topic context', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/outlines',
      payload: {
        projectId: crypto.randomUUID(),
        title: '无效上下文',
        sections: [{ heading: '正文', purpose: '', keyPoints: ['要点'], evidenceMaterialIds: [] }],
      },
    });
    expect(response.statusCode).toBe(400);
  });
});
