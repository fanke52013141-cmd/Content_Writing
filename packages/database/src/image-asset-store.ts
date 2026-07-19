import { and, desc, eq, isNull, ne } from 'drizzle-orm';

import { createDatabase } from './client.js';
import { articles, contentFiles, contentObjects, type ContentFileRecord } from './schema.js';

export class ImageAssetStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  async create(
    ownerUserId: string,
    articleId: string,
    input: {
      storageKey: string;
      originalFilename: string;
      mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
      byteSize: number;
      sha256: string;
    },
  ): Promise<ContentFileRecord | null> {
    const [article] = await this.client.db
      .select({ id: articles.id })
      .from(articles)
      .innerJoin(contentObjects, eq(contentObjects.id, articles.id))
      .where(
        and(
          eq(articles.id, articleId),
          eq(articles.ownerUserId, ownerUserId),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .limit(1);
    if (!article) return null;
    const [file] = await this.client.db
      .insert(contentFiles)
      .values({
        ownerUserId,
        contentObjectId: articleId,
        fileRole: 'image',
        storageKey: input.storageKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        sha256: input.sha256,
      })
      .returning();
    return file ?? null;
  }

  async list(ownerUserId: string, articleId: string): Promise<readonly ContentFileRecord[]> {
    return this.client.db
      .select()
      .from(contentFiles)
      .where(
        and(
          eq(contentFiles.ownerUserId, ownerUserId),
          eq(contentFiles.contentObjectId, articleId),
          eq(contentFiles.fileRole, 'image'),
          isNull(contentFiles.deletedAt),
        ),
      )
      .orderBy(desc(contentFiles.createdAt));
  }

  async get(
    ownerUserId: string,
    articleId: string,
    fileId: string,
  ): Promise<ContentFileRecord | null> {
    const [file] = await this.client.db
      .select()
      .from(contentFiles)
      .where(
        and(
          eq(contentFiles.id, fileId),
          eq(contentFiles.ownerUserId, ownerUserId),
          eq(contentFiles.contentObjectId, articleId),
          eq(contentFiles.fileRole, 'image'),
          isNull(contentFiles.deletedAt),
        ),
      )
      .limit(1);
    return file ?? null;
  }

  async remove(
    ownerUserId: string,
    articleId: string,
    fileId: string,
  ): Promise<ContentFileRecord | null> {
    const [file] = await this.client.db
      .update(contentFiles)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(contentFiles.id, fileId),
          eq(contentFiles.ownerUserId, ownerUserId),
          eq(contentFiles.contentObjectId, articleId),
          eq(contentFiles.fileRole, 'image'),
          isNull(contentFiles.deletedAt),
        ),
      )
      .returning();
    return file ?? null;
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
