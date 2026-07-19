import type { Article, DeletionAudit } from '@content-writing/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryAccountRepository } from '../accounts/account.repository.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryMaterialRepository } from '../materials/material.repository.js';
import { InMemoryProjectRepository } from '../projects/project.repository.js';
import { InMemoryTopicRepository } from '../topics/topic.repository.js';
import { InMemoryArticleRepository } from './article.repository.js';

describe('article API', () => {
  const articleRepository = new InMemoryArticleRepository();
  let app: Awaited<ReturnType<typeof createApp>>;
  let articleId = '';
  let currentVersionId = '';
  let candidateVersionId = '';

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
      projectRepository: new InMemoryProjectRepository(),
      topicRepository: new InMemoryTopicRepository(),
      materialRepository: new InMemoryMaterialRepository(),
      articleRepository,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a manual Current version and keeps an AI candidate separate', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/articles',
      payload: { title: '文章初稿', body: '第一版正文' },
    });
    expect(created.statusCode).toBe(201);
    const article = created.json<Article>();
    articleId = article.id;
    currentVersionId = article.currentVersionId;
    expect(article.currentVersion.status).toBe('current');
    expect(article.versions).toHaveLength(1);

    const candidateResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/articles/${articleId}/candidates`,
      payload: { title: 'AI 改写候选', body: '候选正文', kind: 'ai_candidate' },
    });
    expect(candidateResponse.statusCode).toBe(201);
    const candidateArticle = candidateResponse.json<Article>();
    const candidate = candidateArticle.versions.find((version) => version.status === 'candidate');
    candidateVersionId = candidate?.id ?? '';
    expect(candidateVersionId).not.toBe('');
    expect(candidateArticle.currentVersionId).toBe(currentVersionId);
    expect(candidateArticle.currentVersion.body).toBe('第一版正文');
  });

  it('only switches Current after explicit acceptance, then attaches reviews to that version', async () => {
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/articles/${articleId}/versions/${candidateVersionId}/accept`,
    });
    expect(accepted.statusCode).toBe(201);
    const article = accepted.json<Article>();
    expect(article.currentVersionId).toBe(candidateVersionId);
    expect(article.currentVersion.body).toBe('候选正文');
    expect(article.versions.find((version) => version.id === currentVersionId)?.status).toBe(
      'superseded',
    );

    const review = await app.inject({
      method: 'POST',
      url: `/api/v1/articles/${articleId}/reviews`,
      payload: {
        versionId: candidateVersionId,
        capabilityKey: 'review.fact-risk',
        verdict: 'needs_revision',
        summary: '需要补充引用来源',
        findings: [{ severity: 'warning', message: '关键结论缺少原始来源', location: '第二段' }],
      },
    });
    expect(review.statusCode).toBe(201);
    expect(review.json<Article>().reviews[0]?.versionId).toBe(candidateVersionId);
  });

  it('archives and restores the article without changing its Current version', async () => {
    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/v1/articles/${articleId}`,
      payload: { status: 'archived' },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json<Article>()).toMatchObject({
      status: 'archived',
      currentVersionId: candidateVersionId,
    });

    const restored = await app.inject({
      method: 'PATCH',
      url: `/api/v1/articles/${articleId}`,
      payload: { status: 'active' },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json<Article>()).toMatchObject({
      status: 'active',
      currentVersionId: candidateVersionId,
    });
  });

  it('records soft and permanent deletion without exposing content in the audit', async () => {
    const soft = await app.inject({
      method: 'DELETE',
      url: `/api/v1/articles/${articleId}?mode=soft`,
    });
    expect(soft.statusCode).toBe(200);
    expect(soft.json<DeletionAudit>()).toMatchObject({
      objectId: articleId,
      objectType: 'article',
      mode: 'soft',
    });
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/articles/${articleId}` })).statusCode,
    ).toBe(404);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/articles',
      payload: { title: '待彻底删除', body: '只保留无内容审计' },
    });
    const second = created.json<Article>();
    const permanent = await app.inject({
      method: 'DELETE',
      url: `/api/v1/articles/${second.id}?mode=permanent`,
    });
    expect(permanent.statusCode).toBe(200);
    expect(permanent.json<DeletionAudit>()).toMatchObject({
      objectId: second.id,
      mode: 'permanent',
    });
    expect(permanent.json()).not.toHaveProperty('body');
  });
});
