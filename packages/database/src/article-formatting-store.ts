import type { ArticleExportFormat, ArticleFormatTheme } from '@content-writing/contracts';
import { and, desc, eq } from 'drizzle-orm';

import { createDatabase } from './client.js';
import { articleExports, articles, articleVersions, type ArticleExportRecord } from './schema.js';

export class ArticleFormattingStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  async createExport(
    ownerUserId: string,
    input: {
      articleId: string;
      versionId: string;
      theme: ArticleFormatTheme;
      format: ArticleExportFormat;
      filename: string;
      content: string;
    },
  ): Promise<ArticleExportRecord | null> {
    const [version] = await this.client.db
      .select({ versionId: articleVersions.id })
      .from(articleVersions)
      .innerJoin(
        articles,
        and(eq(articles.id, articleVersions.articleId), eq(articles.ownerUserId, ownerUserId)),
      )
      .where(
        and(
          eq(articleVersions.id, input.versionId),
          eq(articleVersions.articleId, input.articleId),
          eq(articleVersions.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    if (!version) return null;
    const [record] = await this.client.db
      .insert(articleExports)
      .values({ ownerUserId, ...input })
      .returning();
    return record ?? null;
  }

  async list(ownerUserId: string, articleId: string): Promise<readonly ArticleExportRecord[]> {
    return this.client.db
      .select()
      .from(articleExports)
      .where(
        and(eq(articleExports.ownerUserId, ownerUserId), eq(articleExports.articleId, articleId)),
      )
      .orderBy(desc(articleExports.createdAt));
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
