import type { DeletionAudit } from '@content-writing/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryAccountRepository } from '../accounts/account.repository.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryMaterialRepository } from '../materials/material.repository.js';
import { InMemoryProjectRepository } from '../projects/project.repository.js';
import { InMemoryTopicRepository } from '../topics/topic.repository.js';

describe('deletion API', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

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

  afterAll(async () => {
    await app.close();
  });

  it('accepts archive, soft and permanent modes and returns audit-only data', async () => {
    for (const mode of ['archive', 'soft', 'permanent'] as const) {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/deletions/material/019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7?mode=${mode}`,
      });
      expect(response.statusCode).toBe(200);
      const audit = response.json<DeletionAudit>();
      expect(audit).toMatchObject({ objectType: 'material', mode });
      expect(audit).not.toHaveProperty('content');
    }
  });

  it('rejects unknown object types before touching a repository', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/deletions/wechat/019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7?mode=soft',
    });
    expect(response.statusCode).toBe(400);
  });
});
