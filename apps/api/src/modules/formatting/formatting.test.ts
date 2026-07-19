import type {
  Article,
  ArticleExport,
  ArticleImage,
  ArticleFormatPreview,
} from '@content-writing/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryAccountRepository } from '../accounts/account.repository.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryMaterialRepository } from '../materials/material.repository.js';
import { InMemoryStorageProvider } from '../materials/storage.provider.js';
import { InMemoryProjectRepository } from '../projects/project.repository.js';
import { InMemoryTopicRepository } from '../topics/topic.repository.js';
import { InMemoryArticleRepository } from '../articles/article.repository.js';

function multipart(boundary: string, mimeType: string, content: Buffer): string {
  return [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="image.png"',
    `Content-Type: ${mimeType}`,
    '',
    content.toString('latin1'),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

describe('article formatting and local image API', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let articleId = '';

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
      projectRepository: new InMemoryProjectRepository(),
      topicRepository: new InMemoryTopicRepository(),
      materialRepository: new InMemoryMaterialRepository(),
      articleRepository: new InMemoryArticleRepository(),
      storageProvider: new InMemoryStorageProvider(),
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/articles',
      payload: { title: '排版验收文章', body: '第一段\n\n第二段' },
    });
    articleId = created.json<Article>().id;
  });

  afterAll(async () => app.close());

  it('accepts only local raster uploads and returns an immutable placeholder', async () => {
    const boundary = `image-${crypto.randomUUID()}`;
    const uploaded = await app.inject({
      method: 'POST',
      url: `/api/v1/articles/${articleId}/images`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(boundary, 'image/png', Buffer.from('PNG bytes')),
    });
    expect(uploaded.statusCode).toBe(201);
    const image = uploaded.json<ArticleImage>();
    expect(image.placeholder).toBe(`{{image:${image.id}}}`);

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/v1/articles/${articleId}/images`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(boundary, 'image/svg+xml', Buffer.from('<svg/>')),
    });
    expect(rejected.statusCode).toBe(400);
  });

  it('renders preview and records both Markdown and HTML export history', async () => {
    const previewResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/articles/${articleId}/format-preview`,
      payload: { theme: 'classic_wechat' },
    });
    const preview = previewResponse.json<ArticleFormatPreview>();
    expect(previewResponse.statusCode).toBe(201);
    expect(preview.html).toContain('data-theme="classic_wechat"');
    expect(preview.copyText).toContain('第一段');

    for (const format of ['markdown', 'html'] as const) {
      const exported = await app.inject({
        method: 'POST',
        url: `/api/v1/articles/${articleId}/exports`,
        payload: { theme: 'minimal', format },
      });
      expect(exported.statusCode).toBe(201);
      expect(exported.json<ArticleExport>().format).toBe(format);
    }
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/articles/${articleId}/exports`,
    });
    expect(history.json<ArticleExport[]>()).toHaveLength(2);
  });
});
