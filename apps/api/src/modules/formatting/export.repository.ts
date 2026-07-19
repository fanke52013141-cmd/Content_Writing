import type { ArticleExport, CreateArticleExport } from '@content-writing/contracts';
import { ArticleFormattingStore, type ArticleExportRecord } from '@content-writing/database';

export interface ArticleExportRepository {
  create(
    ownerUserId: string,
    input: CreateArticleExport & {
      articleId: string;
      versionId: string;
      filename: string;
      content: string;
    },
  ): Promise<ArticleExport | null>;
  list(ownerUserId: string, articleId: string): Promise<readonly ArticleExport[]>;
  close?(): Promise<void>;
}

export const EXPORT_REPOSITORY = Symbol('EXPORT_REPOSITORY');

function exportFromRecord(record: ArticleExportRecord): ArticleExport {
  return {
    id: record.id,
    articleId: record.articleId,
    versionId: record.versionId,
    theme: record.theme,
    format: record.format,
    filename: record.filename,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
  };
}

export class PostgresArticleExportRepository implements ArticleExportRepository {
  private readonly store: ArticleFormattingStore;
  constructor(databaseUrl: string) {
    this.store = new ArticleFormattingStore(databaseUrl);
  }
  async create(ownerUserId: string, input: Parameters<ArticleExportRepository['create']>[1]) {
    const record = await this.store.createExport(ownerUserId, input);
    return record ? exportFromRecord(record) : null;
  }
  async list(ownerUserId: string, articleId: string) {
    return (await this.store.list(ownerUserId, articleId)).map(exportFromRecord);
  }
  close() {
    return this.store.close();
  }
}

interface OwnedExport extends ArticleExport {
  ownerUserId: string;
}

export class InMemoryArticleExportRepository implements ArticleExportRepository {
  private readonly records = new Map<string, OwnedExport>();
  create(ownerUserId: string, input: Parameters<ArticleExportRepository['create']>[1]) {
    const record: OwnedExport = {
      id: crypto.randomUUID(),
      ownerUserId,
      articleId: input.articleId,
      versionId: input.versionId,
      theme: input.theme,
      format: input.format,
      filename: input.filename,
      content: input.content,
      createdAt: new Date().toISOString(),
    };
    this.records.set(record.id, record);
    const publicRecord = { ...record } as ArticleExport;
    delete (publicRecord as ArticleExport & { ownerUserId?: string }).ownerUserId;
    return Promise.resolve(publicRecord);
  }
  list(ownerUserId: string, articleId: string) {
    return Promise.resolve(
      [...this.records.values()]
        .filter((record) => record.ownerUserId === ownerUserId && record.articleId === articleId)
        .map((record) => {
          const publicRecord = { ...record } as ArticleExport;
          delete (publicRecord as ArticleExport & { ownerUserId?: string }).ownerUserId;
          return publicRecord;
        }),
    );
  }
}
