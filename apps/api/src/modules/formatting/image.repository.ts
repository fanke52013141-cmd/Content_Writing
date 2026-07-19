import type { ArticleImage } from '@content-writing/contracts';
import { ImageAssetStore, type ContentFileRecord } from '@content-writing/database';

export interface ImageAssetRepository {
  create(
    ownerUserId: string,
    articleId: string,
    input: {
      storageKey: string;
      originalFilename: string;
      mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
      byteSize: number;
      sha256: string;
    },
  ): Promise<ContentFileRecord | null>;
  list(ownerUserId: string, articleId: string): Promise<readonly ContentFileRecord[]>;
  get(ownerUserId: string, articleId: string, fileId: string): Promise<ContentFileRecord | null>;
  remove(ownerUserId: string, articleId: string, fileId: string): Promise<ContentFileRecord | null>;
  close?(): Promise<void>;
}

export const IMAGE_REPOSITORY = Symbol('IMAGE_REPOSITORY');

export class PostgresImageAssetRepository implements ImageAssetRepository {
  private readonly store: ImageAssetStore;
  constructor(databaseUrl: string) {
    this.store = new ImageAssetStore(databaseUrl);
  }
  create(
    ownerUserId: string,
    articleId: string,
    input: Parameters<ImageAssetRepository['create']>[2],
  ) {
    return this.store.create(ownerUserId, articleId, input);
  }
  list(ownerUserId: string, articleId: string) {
    return this.store.list(ownerUserId, articleId);
  }
  get(ownerUserId: string, articleId: string, fileId: string) {
    return this.store.get(ownerUserId, articleId, fileId);
  }
  remove(ownerUserId: string, articleId: string, fileId: string) {
    return this.store.remove(ownerUserId, articleId, fileId);
  }
  close() {
    return this.store.close();
  }
}

interface OwnedFile extends ContentFileRecord {
  ownerUserId: string;
  articleId: string;
}

export class InMemoryImageAssetRepository implements ImageAssetRepository {
  private readonly files = new Map<string, OwnedFile>();
  create(
    ownerUserId: string,
    articleId: string,
    input: Parameters<ImageAssetRepository['create']>[2],
  ) {
    const now = new Date();
    const file = {
      id: crypto.randomUUID(),
      ownerUserId,
      contentObjectId: articleId,
      fileRole: 'image' as const,
      storageKey: input.storageKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      sha256: input.sha256,
      expiresAt: null,
      deletedAt: null,
      createdAt: now,
    } satisfies ContentFileRecord;
    this.files.set(file.id, { ...file, ownerUserId, articleId });
    return Promise.resolve(file);
  }
  list(ownerUserId: string, articleId: string) {
    return Promise.resolve(
      [...this.files.values()]
        .filter(
          (file) =>
            file.ownerUserId === ownerUserId && file.articleId === articleId && !file.deletedAt,
        )
        .map((file) => file),
    );
  }
  get(ownerUserId: string, articleId: string, fileId: string) {
    const file = this.files.get(fileId);
    if (
      !file ||
      file.ownerUserId !== ownerUserId ||
      file.articleId !== articleId ||
      file.deletedAt
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(file);
  }
  remove(ownerUserId: string, articleId: string, fileId: string) {
    const file = this.files.get(fileId);
    if (
      !file ||
      file.ownerUserId !== ownerUserId ||
      file.articleId !== articleId ||
      file.deletedAt
    ) {
      return Promise.resolve(null);
    }
    const updated = { ...file, deletedAt: new Date() };
    this.files.set(fileId, updated);
    return Promise.resolve(updated);
  }
}

export function imageFromFile(record: ContentFileRecord, articleId: string): ArticleImage {
  return {
    id: record.id,
    articleId,
    originalFilename: record.originalFilename || 'image',
    mimeType: record.mimeType as ArticleImage['mimeType'],
    byteSize: record.byteSize,
    licenseStatus: 'unknown',
    publishable: false,
    placeholder: `{{image:${record.id}}}`,
    downloadPath: `/api/v1/articles/${articleId}/images/${record.id}/content`,
    createdAt: record.createdAt.toISOString(),
  };
}
