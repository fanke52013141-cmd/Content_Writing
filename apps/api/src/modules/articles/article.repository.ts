import {
  articleSchema,
  reviewSchema,
  type Article,
  type CreateArticle,
  type CreateArticleCandidate,
  type CreateReview,
  type DeletionAudit,
  type Review,
  type UpdateArticle,
} from '@content-writing/contracts';
import {
  ArticleStore,
  InMemoryArticleRepository as DatabaseInMemoryArticleRepository,
  type ArticleAggregateRecord,
} from '@content-writing/database';

export type ArticleRepositoryMutation =
  | { kind: 'ok'; article: Article }
  | { kind: 'not_found' }
  | { kind: 'invalid_context' }
  | { kind: 'invalid_version' };

export interface ArticleRepository {
  create(ownerUserId: string, input: CreateArticle): Promise<Article | null>;
  list(ownerUserId: string): Promise<readonly Article[]>;
  get(ownerUserId: string, articleId: string): Promise<Article | null>;
  createCandidate(
    ownerUserId: string,
    articleId: string,
    input: CreateArticleCandidate,
  ): Promise<ArticleRepositoryMutation>;
  acceptCandidate(
    ownerUserId: string,
    articleId: string,
    versionId: string,
  ): Promise<ArticleRepositoryMutation>;
  createReview(
    ownerUserId: string,
    articleId: string,
    input: CreateReview,
  ): Promise<ArticleRepositoryMutation>;
  update(
    ownerUserId: string,
    articleId: string,
    input: UpdateArticle,
  ): Promise<ArticleRepositoryMutation>;
  delete(
    ownerUserId: string,
    articleId: string,
    mode: 'archive' | 'soft' | 'permanent',
  ): Promise<{ audit: DeletionAudit; storageKeys: readonly string[] } | null>;
  close?(): Promise<void>;
}

export const ARTICLE_REPOSITORY = Symbol('ARTICLE_REPOSITORY');

function articleFromAggregate(record: ArticleAggregateRecord): Article {
  if (record.object.status !== 'active' && record.object.status !== 'archived') {
    throw new Error('Article has an invalid public lifecycle status.');
  }
  const versions = record.versions.map((version) => ({
    id: version.id,
    articleId: version.articleId,
    versionNumber: version.versionNumber,
    title: version.title,
    body: version.body,
    kind: version.kind,
    status: version.status,
    sourceGenerationId: version.sourceGenerationId,
    sourceReviewId: version.sourceReviewId,
    createdAt: version.createdAt.toISOString(),
    acceptedAt: version.acceptedAt?.toISOString() ?? null,
  }));
  const reviews: Review[] = record.reviews.map((review) =>
    reviewSchema.parse({
      id: review.id,
      articleId: review.articleId,
      versionId: review.versionId,
      capabilityKey: review.capabilityKey,
      verdict: review.verdict,
      summary: review.summary,
      findings: review.findings,
      createdAt: review.createdAt.toISOString(),
    }),
  );
  const currentVersion = versions.find((version) => version.id === record.article.currentVersionId);
  if (!currentVersion) throw new Error('Article has no current version.');
  return articleSchema.parse({
    id: record.article.id,
    projectId: record.article.projectId,
    topicId: record.article.topicId,
    outlineId: record.article.outlineId,
    title: record.article.title,
    status: record.object.status,
    currentVersionId: record.article.currentVersionId,
    currentVersion,
    versions,
    reviews,
    createdAt: record.article.createdAt.toISOString(),
    updatedAt: record.article.updatedAt.toISOString(),
    archivedAt: record.object.archivedAt?.toISOString() ?? null,
  });
}

export class PostgresArticleRepository implements ArticleRepository {
  private readonly store: ArticleStore;

  constructor(databaseUrl: string) {
    this.store = new ArticleStore(databaseUrl);
  }

  async create(ownerUserId: string, input: CreateArticle): Promise<Article | null> {
    const result = await this.store.create(ownerUserId, input);
    return result ? articleFromAggregate(result) : null;
  }

  async list(ownerUserId: string): Promise<readonly Article[]> {
    return (await this.store.list(ownerUserId)).map(articleFromAggregate);
  }

  async get(ownerUserId: string, articleId: string): Promise<Article | null> {
    const result = await this.store.get(ownerUserId, articleId);
    return result ? articleFromAggregate(result) : null;
  }

  async createCandidate(
    ownerUserId: string,
    articleId: string,
    input: CreateArticleCandidate,
  ): Promise<ArticleRepositoryMutation> {
    const result = await this.store.createCandidate(ownerUserId, articleId, input);
    return result.kind === 'ok'
      ? { kind: 'ok', article: articleFromAggregate(result.article) }
      : result;
  }

  async acceptCandidate(
    ownerUserId: string,
    articleId: string,
    versionId: string,
  ): Promise<ArticleRepositoryMutation> {
    const result = await this.store.acceptCandidate(ownerUserId, articleId, versionId);
    return result.kind === 'ok'
      ? { kind: 'ok', article: articleFromAggregate(result.article) }
      : result;
  }

  async createReview(
    ownerUserId: string,
    articleId: string,
    input: CreateReview,
  ): Promise<ArticleRepositoryMutation> {
    const result = await this.store.createReview(ownerUserId, articleId, input);
    return result.kind === 'ok'
      ? { kind: 'ok', article: articleFromAggregate(result.article) }
      : result;
  }

  async update(
    ownerUserId: string,
    articleId: string,
    input: UpdateArticle,
  ): Promise<ArticleRepositoryMutation> {
    const result = await this.store.update(ownerUserId, articleId, input);
    return result.kind === 'ok'
      ? { kind: 'ok', article: articleFromAggregate(result.article) }
      : result;
  }

  async delete(
    ownerUserId: string,
    articleId: string,
    mode: 'archive' | 'soft' | 'permanent',
  ): Promise<{ audit: DeletionAudit; storageKeys: readonly string[] } | null> {
    const result = await this.store.delete(ownerUserId, articleId, mode);
    if (result.kind !== 'ok' || !result.audit) return null;
    return {
      audit: { ...result.audit, occurredAt: result.audit.occurredAt.toISOString() },
      storageKeys: result.storageKeys ?? [],
    };
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

export class InMemoryArticleRepository implements ArticleRepository {
  private readonly store: DatabaseInMemoryArticleRepository;

  constructor(
    projectIds = new Set<string>(),
    topicIds = new Set<string>(),
    outlineIds = new Set<string>(),
  ) {
    this.store = new DatabaseInMemoryArticleRepository(projectIds, topicIds, outlineIds);
  }

  async create(ownerUserId: string, input: CreateArticle): Promise<Article | null> {
    const result = await this.store.create(ownerUserId, input);
    return result ? articleFromAggregate(result) : null;
  }

  async list(ownerUserId: string): Promise<readonly Article[]> {
    return (await this.store.list(ownerUserId)).map(articleFromAggregate);
  }

  async get(ownerUserId: string, articleId: string): Promise<Article | null> {
    const result = await this.store.get(ownerUserId, articleId);
    return result ? articleFromAggregate(result) : null;
  }

  async createCandidate(
    ownerUserId: string,
    articleId: string,
    input: CreateArticleCandidate,
  ): Promise<ArticleRepositoryMutation> {
    const result = await this.store.createCandidate(ownerUserId, articleId, input);
    return result.kind === 'ok'
      ? { kind: 'ok', article: articleFromAggregate(result.article) }
      : result;
  }

  async acceptCandidate(
    ownerUserId: string,
    articleId: string,
    versionId: string,
  ): Promise<ArticleRepositoryMutation> {
    const result = await this.store.acceptCandidate(ownerUserId, articleId, versionId);
    return result.kind === 'ok'
      ? { kind: 'ok', article: articleFromAggregate(result.article) }
      : result;
  }

  async createReview(
    ownerUserId: string,
    articleId: string,
    input: CreateReview,
  ): Promise<ArticleRepositoryMutation> {
    const result = await this.store.createReview(ownerUserId, articleId, input);
    return result.kind === 'ok'
      ? { kind: 'ok', article: articleFromAggregate(result.article) }
      : result;
  }

  async update(
    ownerUserId: string,
    articleId: string,
    input: UpdateArticle,
  ): Promise<ArticleRepositoryMutation> {
    const result = await this.store.update(ownerUserId, articleId, input);
    return result.kind === 'ok'
      ? { kind: 'ok', article: articleFromAggregate(result.article) }
      : result;
  }

  async delete(
    ownerUserId: string,
    articleId: string,
    mode: 'archive' | 'soft' | 'permanent',
  ): Promise<{ audit: DeletionAudit; storageKeys: readonly string[] } | null> {
    const result = await this.store.delete(ownerUserId, articleId, mode);
    if (result.kind !== 'ok' || !result.audit) return null;
    return {
      audit: { ...result.audit, occurredAt: result.audit.occurredAt.toISOString() },
      storageKeys: result.storageKeys ?? [],
    };
  }
}
