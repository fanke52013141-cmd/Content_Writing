import type { Material } from '@content-writing/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import { InMemoryAccountRepository } from '../accounts/account.repository.js';
import { InMemoryGenerationRepository } from '../generations/generation.repository.js';
import { InMemoryLocalUserRepository } from '../identity/local-user.repository.js';
import { InMemoryProjectRepository } from '../projects/project.repository.js';
import { InMemoryTopicRepository } from '../topics/topic.repository.js';
import type { DocumentExtractor, WebpageExtractor } from './material-extractor.js';
import { InMemoryMaterialRepository } from './material.repository.js';
import { InMemoryStorageProvider } from './storage.provider.js';

const projectId = '019f754a-c6d8-7fa2-a3c8-333333333333';
const topicId = '019f754a-c6d8-7fa2-a3c8-444444444444';
const fetchedAt = new Date('2026-07-18T08:00:00.000Z');

function multipart(
  boundary: string,
  fields: Readonly<Record<string, string>>,
  file: { filename: string; mimeType: string; content: Buffer },
): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    ),
    file.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return Buffer.concat(chunks);
}

describe('material API', () => {
  let app: NestFastifyApplication;
  let textMaterialId: string;
  let documentMaterialId: string;
  const storage = new InMemoryStorageProvider();
  const documentExtractor: DocumentExtractor = {
    extract: vi.fn((kind) =>
      Promise.resolve(
        kind === 'pdf'
          ? { text: '', warnings: [] }
          : { text: 'DOCX 提取后的正文', warnings: ['忽略了复杂样式'] },
      ),
    ),
  };
  const webpageExtractor: WebpageExtractor = {
    extract: vi.fn(() =>
      Promise.resolve({
        finalUrl: 'https://example.com/final',
        title: '网页素材标题',
        siteName: '示例站点',
        text: '网页中可用于创作的正文内容。',
        rawHtml: Buffer.from('<article>网页中可用于创作的正文内容。</article>'),
        fetchedAt,
      }),
    ),
  };

  beforeAll(async () => {
    app = await createApp({
      localUserRepository: new InMemoryLocalUserRepository(),
      generationRepository: new InMemoryGenerationRepository(),
      accountRepository: new InMemoryAccountRepository(),
      projectRepository: new InMemoryProjectRepository(),
      topicRepository: new InMemoryTopicRepository(),
      materialRepository: new InMemoryMaterialRepository(
        new Map([[projectId, '创作项目']]),
        new Map([[topicId, '核心选题']]),
      ),
      storageProvider: storage,
      documentExtractor,
      webpageExtractor,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an independent Markdown material with server-controlled provenance', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/materials/text',
      payload: { title: '手动研究笔记', kind: 'markdown', content: '# 判断\n\n论据' },
    });
    const material = response.json<Material>();
    textMaterialId = material.id;

    expect(response.statusCode).toBe(201);
    expect(material).toMatchObject({
      kind: 'markdown',
      extractedText: '# 判断\n\n论据',
      fileAvailable: false,
      termsReviewStatus: 'not_applicable',
      projectLinks: [],
      topicLinks: [],
    });
  });

  it('imports a webpage with pending terms review and a 14-day raw snapshot', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/materials/url',
      payload: { url: 'https://example.com/original' },
    });
    const material = response.json<Material>();

    expect(response.statusCode).toBe(201);
    expect(material).toMatchObject({
      title: '网页素材标题',
      sourceUrl: 'https://example.com/final',
      sourceSiteName: '示例站点',
      termsReviewStatus: 'pending',
      fileAvailable: false,
    });
    expect(material.rawSnapshotExpiresAt).toBe('2026-08-01T08:00:00.000Z');
    expect([...storage.files.keys()].some((key) => key.endsWith('/raw.html'))).toBe(true);
  });

  it('uploads a DOCX original, records its hash and exposes extractor warnings', async () => {
    const boundary = `material-${crypto.randomUUID()}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/materials/file',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(
        boundary,
        { title: '访谈纪要' },
        {
          filename: 'interview.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content: Buffer.from('PK fake docx content'),
        },
      ),
    });
    const material = response.json<Material>();
    documentMaterialId = material.id;

    expect(response.statusCode).toBe(201);
    expect(material).toMatchObject({
      title: '访谈纪要',
      kind: 'docx',
      extractedText: 'DOCX 提取后的正文',
      originalFilename: 'interview.docx',
      fileAvailable: true,
      extractionWarnings: ['忽略了复杂样式'],
    });
    expect(material.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects a scanned PDF when no text can be extracted', async () => {
    const boundary = `material-${crypto.randomUUID()}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/materials/file',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(
        boundary,
        {},
        {
          filename: 'scan.pdf',
          mimeType: 'application/pdf',
          content: Buffer.from('%PDF- fake scanned PDF'),
        },
      ),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('OCR is not supported');
  });

  it('links and unlinks both project and topic contexts without deleting material', async () => {
    const projectLink = await app.inject({
      method: 'PUT',
      url: `/api/v1/materials/${documentMaterialId}/projects/${projectId}`,
    });
    expect(projectLink.json<Material>().projectLinks).toEqual([
      { projectId, projectTitle: '创作项目' },
    ]);

    const topicLink = await app.inject({
      method: 'PUT',
      url: `/api/v1/materials/${documentMaterialId}/topics/${topicId}`,
    });
    expect(topicLink.json<Material>().topicLinks).toEqual([{ topicId, topicTitle: '核心选题' }]);

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/materials/${documentMaterialId}/projects/${projectId}`,
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/materials/${documentMaterialId}/topics/${topicId}`,
    });
    const material = await app.inject({
      method: 'GET',
      url: `/api/v1/materials/${documentMaterialId}`,
    });
    expect(material.json<Material>()).toMatchObject({ projectLinks: [], topicLinks: [] });
  });

  it('archives and restores material while rejecting terms review on non-web sources', async () => {
    const invalidReview = await app.inject({
      method: 'PATCH',
      url: `/api/v1/materials/${textMaterialId}`,
      payload: { termsReviewStatus: 'approved' },
    });
    expect(invalidReview.statusCode).toBe(400);

    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/v1/materials/${textMaterialId}`,
      payload: { status: 'archived' },
    });
    expect(archived.json<Material>().archivedAt).not.toBeNull();

    const restored = await app.inject({
      method: 'PATCH',
      url: `/api/v1/materials/${textMaterialId}`,
      payload: { status: 'active' },
    });
    expect(restored.json<Material>()).toMatchObject({ status: 'active', archivedAt: null });
  });
});
