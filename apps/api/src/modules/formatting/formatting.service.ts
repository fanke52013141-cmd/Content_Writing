import { createHash } from 'node:crypto';
import type {
  Article,
  ArticleExport,
  ArticleFormatPreview,
  ArticleImage,
  CreateArticleExport,
  CreateFormatPreview,
} from '@content-writing/contracts';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import { ARTICLE_REPOSITORY, type ArticleRepository } from '../articles/article.repository.js';
import { type StorageProvider, STORAGE_PROVIDER } from '../materials/storage.provider.js';
import { EXPORT_REPOSITORY, type ArticleExportRepository } from './export.repository.js';
import { IMAGE_REPOSITORY, imageFromFile, type ImageAssetRepository } from './image.repository.js';

const placeholderPattern = /\{\{image:([0-9a-f-]{36})\}\}/giu;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderBody(body: string): string {
  return body
    .split(/\r?\n/u)
    .map((line) => {
      const placeholder = line.trim().match(/^\{\{image:([0-9a-f-]{36})\}\}$/iu);
      if (placeholder) {
        return `<p class="image-placeholder" data-image-id="${placeholder[1]}">[图片占位: ${placeholder[1]}]</p>`;
      }
      if (!line.trim()) return '';
      if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith('# ')) return `<h2>${escapeHtml(line.slice(2))}</h2>`;
      return `<p>${escapeHtml(line)}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

function resolveVersion(article: Article, versionId?: string) {
  const version = versionId
    ? article.versions.find((item) => item.id === versionId)
    : article.currentVersion;
  if (!version) throw new NotFoundException('Article version not found.');
  return version;
}

@Injectable()
export class FormattingService implements OnModuleDestroy {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articleRepository: ArticleRepository,
    @Inject(IMAGE_REPOSITORY) private readonly imageRepository: ImageAssetRepository,
    @Inject(EXPORT_REPOSITORY) private readonly exportRepository: ArticleExportRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly identityService: IdentityService,
  ) {}

  async listImages(articleId: string): Promise<readonly ArticleImage[]> {
    const user = await this.identityService.getCurrentUser();
    const article = await this.articleRepository.get(user.id, articleId);
    if (!article) throw new NotFoundException('Article not found.');
    return (await this.imageRepository.list(user.id, articleId)).map((file) =>
      imageFromFile(file, articleId),
    );
  }

  async uploadImage(
    articleId: string,
    input: { filename: string; mimeType: string; content: Buffer },
  ): Promise<ArticleImage> {
    const user = await this.identityService.getCurrentUser();
    const article = await this.articleRepository.get(user.id, articleId);
    if (!article || article.status !== 'active') throw new NotFoundException('Article not found.');
    const mimeType = input.mimeType.toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType)) {
      throw new BadRequestException('Only PNG, JPEG, GIF or WebP images are supported.');
    }
    if (input.content.byteLength === 0 || input.content.byteLength > 10 * 1024 * 1024) {
      throw new BadRequestException('Image size must be between 1 byte and 10 MB.');
    }
    const id = crypto.randomUUID();
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
    const storageKey = `images/${user.id}/${articleId}/${id}.${extension}`;
    await this.storageProvider.write(storageKey, input.content);
    const file = await this.imageRepository.create(user.id, articleId, {
      storageKey,
      originalFilename: input.filename.slice(0, 255),
      mimeType: mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
      byteSize: input.content.byteLength,
      sha256: createHash('sha256').update(input.content).digest('hex'),
    });
    if (!file) {
      await this.storageProvider.delete(storageKey);
      throw new NotFoundException('Article not found.');
    }
    return imageFromFile(file, articleId);
  }

  async readImage(
    articleId: string,
    imageId: string,
  ): Promise<{ mimeType: string; content: Buffer }> {
    const user = await this.identityService.getCurrentUser();
    const file = await this.imageRepository.get(user.id, articleId, imageId);
    if (!file) throw new NotFoundException('Image not found.');
    return { mimeType: file.mimeType, content: await this.storageProvider.read(file.storageKey) };
  }

  async removeImage(articleId: string, imageId: string): Promise<void> {
    const user = await this.identityService.getCurrentUser();
    const file = await this.imageRepository.remove(user.id, articleId, imageId);
    if (!file) throw new NotFoundException('Image not found.');
    await this.storageProvider.delete(file.storageKey);
  }

  async preview(articleId: string, input: CreateFormatPreview): Promise<ArticleFormatPreview> {
    const user = await this.identityService.getCurrentUser();
    const article = await this.articleRepository.get(user.id, articleId);
    if (!article) throw new NotFoundException('Article not found.');
    const version = resolveVersion(article, input.versionId);
    const imagePlaceholders = [...version.body.matchAll(placeholderPattern)].map(
      (match) => match[0],
    );
    const markdown = `# ${version.title}\n\n${version.body}`;
    const html = `<article data-theme="${input.theme}"><h1>${escapeHtml(version.title)}</h1>${renderBody(version.body)}</article>`;
    const copyText = `${version.title}\n\n${version.body.replaceAll(placeholderPattern, '[图片占位: $&]')}`;
    return {
      articleId,
      versionId: version.id,
      theme: input.theme,
      title: version.title,
      markdown,
      html,
      copyText,
      imagePlaceholders,
    };
  }

  async createExport(articleId: string, input: CreateArticleExport): Promise<ArticleExport> {
    const user = await this.identityService.getCurrentUser();
    const article = await this.articleRepository.get(user.id, articleId);
    if (!article) throw new NotFoundException('Article not found.');
    const preview = await this.preview(articleId, input);
    const content = input.format === 'markdown' ? preview.markdown : preview.html;
    const filename = `${article.title.slice(0, 80)}-v${article.versions.find((v) => v.id === preview.versionId)?.versionNumber ?? 1}-${input.theme}.${input.format === 'markdown' ? 'md' : 'html'}`;
    const record = await this.exportRepository.create(user.id, {
      ...input,
      articleId,
      versionId: preview.versionId,
      filename,
      content,
    });
    if (!record) throw new BadRequestException('Article version is unavailable.');
    return record;
  }

  async listExports(articleId: string): Promise<readonly ArticleExport[]> {
    const user = await this.identityService.getCurrentUser();
    const article = await this.articleRepository.get(user.id, articleId);
    if (!article) throw new NotFoundException('Article not found.');
    return this.exportRepository.list(user.id, articleId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.imageRepository.close?.();
    await this.exportRepository.close?.();
  }
}
