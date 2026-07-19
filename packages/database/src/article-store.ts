import type {
  CreateArticle,
  CreateArticleCandidate,
  CreateReview,
  UpdateArticle,
} from '@content-writing/contracts';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { createDatabase } from './client.js';
import {
  articleReviews,
  articleVersions,
  articles,
  contentObjects,
  contentProjects,
  contentRelations,
  outlines,
  topics,
  type ArticleRecord,
  type ArticleReviewRecord,
  type ArticleVersionRecord,
  type ContentObjectRecord,
} from './schema.js';

export interface ArticleAggregateRecord {
  object: ContentObjectRecord;
  article: ArticleRecord;
  versions: readonly ArticleVersionRecord[];
  reviews: readonly ArticleReviewRecord[];
}

export type ArticleMutationResult =
  | { kind: 'ok'; article: ArticleAggregateRecord }
  | { kind: 'not_found' }
  | { kind: 'invalid_context' }
  | { kind: 'invalid_version' };

interface ArticleBaseRecord {
  object: ContentObjectRecord;
  article: ArticleRecord;
}

export class ArticleStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  private async getBase(ownerUserId: string, articleId: string): Promise<ArticleBaseRecord | null> {
    const [row] = await this.client.db
      .select({ object: contentObjects, article: articles })
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
    return row ?? null;
  }

  private async loadAggregate(
    ownerUserId: string,
    articleId: string,
  ): Promise<ArticleAggregateRecord | null> {
    const base = await this.getBase(ownerUserId, articleId);
    if (!base) return null;
    const [versions, reviews] = await Promise.all([
      this.client.db
        .select()
        .from(articleVersions)
        .where(
          and(
            eq(articleVersions.articleId, articleId),
            eq(articleVersions.ownerUserId, ownerUserId),
          ),
        )
        .orderBy(asc(articleVersions.versionNumber)),
      this.client.db
        .select()
        .from(articleReviews)
        .where(
          and(eq(articleReviews.articleId, articleId), eq(articleReviews.ownerUserId, ownerUserId)),
        )
        .orderBy(desc(articleReviews.createdAt)),
    ]);
    return { ...base, versions, reviews };
  }

  async create(ownerUserId: string, input: CreateArticle): Promise<ArticleAggregateRecord | null> {
    const articleId = await this.client.db.transaction(async (transaction) => {
      if (input.projectId) {
        const [project] = await transaction
          .select({ id: contentProjects.id })
          .from(contentProjects)
          .innerJoin(contentObjects, eq(contentObjects.id, contentProjects.id))
          .where(
            and(
              eq(contentProjects.id, input.projectId),
              eq(contentProjects.ownerUserId, ownerUserId),
              inArray(contentObjects.status, ['active', 'completed']),
            ),
          )
          .limit(1);
        if (!project) return null;
      }
      if (input.topicId) {
        const [topic] = await transaction
          .select({ id: topics.id })
          .from(topics)
          .innerJoin(contentObjects, eq(contentObjects.id, topics.id))
          .where(
            and(
              eq(topics.id, input.topicId),
              eq(topics.ownerUserId, ownerUserId),
              eq(contentObjects.status, 'active'),
            ),
          )
          .limit(1);
        if (!topic) return null;
      }
      if (input.outlineId) {
        const [outline] = await transaction
          .select({ id: outlines.id })
          .from(outlines)
          .innerJoin(contentObjects, eq(contentObjects.id, outlines.id))
          .where(
            and(
              eq(outlines.id, input.outlineId),
              eq(outlines.ownerUserId, ownerUserId),
              inArray(contentObjects.status, ['active', 'archived']),
            ),
          )
          .limit(1);
        if (!outline) return null;
      }
      const id = crypto.randomUUID();
      const now = new Date();
      const [object] = await transaction
        .insert(contentObjects)
        .values({ id, ownerUserId, objectType: 'article' })
        .returning();
      await transaction.insert(articles).values({
        id,
        ownerUserId,
        projectId: input.projectId ?? null,
        topicId: input.topicId ?? null,
        outlineId: input.outlineId ?? null,
        title: input.title,
        currentVersionId: null,
        createdAt: now,
        updatedAt: now,
      });
      const versionId = crypto.randomUUID();
      await transaction.insert(articleVersions).values({
        id: versionId,
        ownerUserId,
        articleId: id,
        versionNumber: 1,
        title: input.title,
        body: input.body,
        kind: 'manual',
        status: 'current',
        sourceGenerationId: null,
        sourceReviewId: null,
        createdAt: now,
        acceptedAt: now,
      });
      await transaction
        .update(articles)
        .set({ currentVersionId: versionId })
        .where(eq(articles.id, id));
      if (input.projectId) {
        await transaction.insert(contentRelations).values({
          ownerUserId,
          fromObjectId: input.projectId,
          toObjectId: id,
          relationType: 'project_has_article',
          projectScopeId: input.projectId,
        });
      }
      if (!object) throw new Error('Article creation failed.');
      return id;
    });
    return articleId ? this.loadAggregate(ownerUserId, articleId) : null;
  }

  async list(ownerUserId: string): Promise<readonly ArticleAggregateRecord[]> {
    const rows = await this.client.db
      .select({ object: contentObjects, article: articles })
      .from(articles)
      .innerJoin(contentObjects, eq(contentObjects.id, articles.id))
      .where(
        and(
          eq(articles.ownerUserId, ownerUserId),
          eq(contentObjects.objectType, 'article'),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .orderBy(desc(contentObjects.updatedAt));
    const aggregates = await Promise.all(
      rows.map((row) => this.loadAggregate(ownerUserId, row.article.id)),
    );
    return aggregates.filter(
      (aggregate): aggregate is ArticleAggregateRecord => aggregate !== null,
    );
  }

  async get(ownerUserId: string, articleId: string): Promise<ArticleAggregateRecord | null> {
    return this.loadAggregate(ownerUserId, articleId);
  }

  async createCandidate(
    ownerUserId: string,
    articleId: string,
    input: CreateArticleCandidate,
  ): Promise<ArticleMutationResult> {
    const result = await this.client.db.transaction(async (transaction) => {
      const locked = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${articleId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'article' AND status = 'active'
        FOR UPDATE
      `);
      if (locked.length === 0) return 'not_found' as const;
      if (input.sourceReviewId) {
        const [review] = await transaction
          .select({ id: articleReviews.id })
          .from(articleReviews)
          .where(
            and(
              eq(articleReviews.id, input.sourceReviewId),
              eq(articleReviews.articleId, articleId),
              eq(articleReviews.ownerUserId, ownerUserId),
            ),
          )
          .limit(1);
        if (!review) return 'invalid_version' as const;
      }
      const [last] = await transaction
        .select({ versionNumber: articleVersions.versionNumber })
        .from(articleVersions)
        .where(eq(articleVersions.articleId, articleId))
        .orderBy(desc(articleVersions.versionNumber))
        .limit(1);
      const [version] = await transaction
        .insert(articleVersions)
        .values({
          id: crypto.randomUUID(),
          ownerUserId,
          articleId,
          versionNumber: (last?.versionNumber ?? 0) + 1,
          title: input.title,
          body: input.body,
          kind: input.kind,
          status: 'candidate',
          sourceGenerationId: input.sourceGenerationId ?? null,
          sourceReviewId: input.sourceReviewId ?? null,
          acceptedAt: null,
        })
        .returning({ id: articleVersions.id });
      if (!version) throw new Error('Article candidate creation failed.');
      return 'ok' as const;
    });
    if (result !== 'ok') return { kind: result };
    const article = await this.get(ownerUserId, articleId);
    return article ? { kind: 'ok', article } : { kind: 'not_found' };
  }

  async acceptCandidate(
    ownerUserId: string,
    articleId: string,
    versionId: string,
  ): Promise<ArticleMutationResult> {
    const result = await this.client.db.transaction(async (transaction) => {
      const locked = await transaction.execute<{ current_version_id: string | null }>(sql`
        SELECT current_version_id FROM articles
        WHERE id = ${articleId} AND owner_user_id = ${ownerUserId}
        FOR UPDATE
      `);
      const current = locked[0];
      if (!current) return 'not_found' as const;
      const [candidate] = await transaction
        .select({ id: articleVersions.id, status: articleVersions.status })
        .from(articleVersions)
        .where(
          and(
            eq(articleVersions.id, versionId),
            eq(articleVersions.articleId, articleId),
            eq(articleVersions.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      if (!candidate || candidate.status !== 'candidate') return 'invalid_version' as const;
      const now = new Date();
      if (current.current_version_id) {
        await transaction
          .update(articleVersions)
          .set({ status: 'superseded' })
          .where(eq(articleVersions.id, current.current_version_id));
      }
      await transaction
        .update(articleVersions)
        .set({ status: 'current', acceptedAt: now })
        .where(eq(articleVersions.id, versionId));
      const [accepted] = await transaction
        .select({ title: articleVersions.title })
        .from(articleVersions)
        .where(eq(articleVersions.id, versionId))
        .limit(1);
      await transaction
        .update(articles)
        .set({
          currentVersionId: versionId,
          ...(accepted ? { title: accepted.title } : {}),
          updatedAt: now,
        })
        .where(eq(articles.id, articleId));
      return 'ok' as const;
    });
    if (result !== 'ok') return { kind: result };
    const article = await this.get(ownerUserId, articleId);
    return article ? { kind: 'ok', article } : { kind: 'not_found' };
  }

  async createReview(
    ownerUserId: string,
    articleId: string,
    input: CreateReview,
  ): Promise<ArticleMutationResult> {
    const result = await this.client.db.transaction(async (transaction) => {
      const [version] = await transaction
        .select({ id: articleVersions.id })
        .from(articleVersions)
        .innerJoin(articles, eq(articles.id, articleVersions.articleId))
        .where(
          and(
            eq(articles.id, articleId),
            eq(articles.ownerUserId, ownerUserId),
            eq(articleVersions.id, input.versionId),
            eq(articleVersions.ownerUserId, ownerUserId),
          ),
        )
        .limit(1);
      if (!version) return 'invalid_version' as const;
      await transaction.insert(articleReviews).values({
        ownerUserId,
        articleId,
        versionId: input.versionId,
        capabilityKey: input.capabilityKey,
        verdict: input.verdict,
        summary: input.summary,
        findings: input.findings,
      });
      return 'ok' as const;
    });
    if (result !== 'ok') return { kind: result };
    const article = await this.get(ownerUserId, articleId);
    return article ? { kind: 'ok', article } : { kind: 'not_found' };
  }

  async update(
    ownerUserId: string,
    articleId: string,
    input: UpdateArticle,
  ): Promise<ArticleMutationResult> {
    const result = await this.client.db.transaction(async (transaction) => {
      const locked = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${articleId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'article' AND status <> 'deleted'
        FOR UPDATE
      `);
      if (locked.length === 0) return 'not_found' as const;
      const now = new Date();
      await transaction
        .update(contentObjects)
        .set({
          status: input.status,
          archivedAt: input.status === 'archived' ? now : null,
          updatedAt: now,
        })
        .where(eq(contentObjects.id, articleId));
      await transaction.update(articles).set({ updatedAt: now }).where(eq(articles.id, articleId));
      return 'ok' as const;
    });
    if (result !== 'ok') return { kind: result };
    const article = await this.get(ownerUserId, articleId);
    return article ? { kind: 'ok', article } : { kind: 'not_found' };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

interface OwnedArticle extends ArticleAggregateRecord {
  ownerUserId: string;
}

function cloneArticle(article: OwnedArticle): OwnedArticle {
  return structuredClone(article);
}

export class InMemoryArticleRepository {
  private readonly articles = new Map<string, OwnedArticle>();

  constructor(
    private readonly projectIds = new Set<string>(),
    private readonly topicIds = new Set<string>(),
    private readonly outlineIds = new Set<string>(),
  ) {}

  create(ownerUserId: string, input: CreateArticle): Promise<ArticleAggregateRecord | null> {
    if (input.projectId && !this.projectIds.has(input.projectId)) return Promise.resolve(null);
    if (input.topicId && !this.topicIds.has(input.topicId)) return Promise.resolve(null);
    if (input.outlineId && !this.outlineIds.has(input.outlineId)) return Promise.resolve(null);
    const now = new Date();
    const id = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const version = {
      id: versionId,
      ownerUserId,
      articleId: id,
      versionNumber: 1,
      title: input.title,
      body: input.body,
      kind: 'manual' as const,
      status: 'current' as const,
      sourceGenerationId: null,
      sourceReviewId: null,
      createdAt: now,
      acceptedAt: now,
    } satisfies ArticleVersionRecord & { ownerUserId: string };
    const stored: OwnedArticle = {
      ownerUserId,
      object: {
        id,
        ownerUserId,
        objectType: 'article',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
      },
      article: {
        id,
        ownerUserId,
        projectId: input.projectId ?? null,
        topicId: input.topicId ?? null,
        outlineId: input.outlineId ?? null,
        title: input.title,
        currentVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      },
      versions: [version],
      reviews: [],
    };
    this.articles.set(id, stored);
    return Promise.resolve(cloneArticle(stored));
  }

  list(ownerUserId: string): Promise<readonly ArticleAggregateRecord[]> {
    return Promise.resolve(
      [...this.articles.values()]
        .filter((item) => item.ownerUserId === ownerUserId && item.object.status !== 'deleted')
        .sort((a, b) => b.object.updatedAt.getTime() - a.object.updatedAt.getTime())
        .map(cloneArticle),
    );
  }

  get(ownerUserId: string, articleId: string): Promise<ArticleAggregateRecord | null> {
    const article = this.articles.get(articleId);
    return Promise.resolve(
      article?.ownerUserId === ownerUserId && article.object.status !== 'deleted'
        ? cloneArticle(article)
        : null,
    );
  }

  createCandidate(
    ownerUserId: string,
    articleId: string,
    input: CreateArticleCandidate,
  ): Promise<ArticleMutationResult> {
    const current = this.articles.get(articleId);
    if (!current || current.ownerUserId !== ownerUserId || current.object.status !== 'active') {
      return Promise.resolve({ kind: 'not_found' });
    }
    if (
      input.sourceReviewId &&
      !current.reviews.some((review) => review.id === input.sourceReviewId)
    ) {
      return Promise.resolve({ kind: 'invalid_version' });
    }
    const now = new Date();
    const version = {
      id: crypto.randomUUID(),
      ownerUserId,
      articleId,
      versionNumber: current.versions.length + 1,
      title: input.title,
      body: input.body,
      kind: input.kind,
      status: 'candidate' as const,
      sourceGenerationId: input.sourceGenerationId ?? null,
      sourceReviewId: input.sourceReviewId ?? null,
      createdAt: now,
      acceptedAt: null,
    } satisfies ArticleVersionRecord & { ownerUserId: string };
    const updated: OwnedArticle = {
      ...current,
      article: { ...current.article, updatedAt: now },
      object: { ...current.object, updatedAt: now },
      versions: [...current.versions, version],
    };
    this.articles.set(articleId, updated);
    return Promise.resolve({ kind: 'ok', article: cloneArticle(updated) });
  }

  acceptCandidate(
    ownerUserId: string,
    articleId: string,
    versionId: string,
  ): Promise<ArticleMutationResult> {
    const current = this.articles.get(articleId);
    if (!current || current.ownerUserId !== ownerUserId)
      return Promise.resolve({ kind: 'not_found' });
    const candidate = current.versions.find((version) => version.id === versionId);
    if (!candidate || candidate.status !== 'candidate') {
      return Promise.resolve({ kind: 'invalid_version' });
    }
    const now = new Date();
    const versions = current.versions.map((version) =>
      version.id === current.article.currentVersionId
        ? { ...version, status: 'superseded' as const }
        : version.id === versionId
          ? { ...version, status: 'current' as const, acceptedAt: now }
          : version,
    );
    const updated: OwnedArticle = {
      ...current,
      article: {
        ...current.article,
        title: candidate.title,
        currentVersionId: versionId,
        updatedAt: now,
      },
      object: { ...current.object, updatedAt: now },
      versions,
    };
    this.articles.set(articleId, updated);
    return Promise.resolve({ kind: 'ok', article: cloneArticle(updated) });
  }

  createReview(
    ownerUserId: string,
    articleId: string,
    input: CreateReview,
  ): Promise<ArticleMutationResult> {
    const current = this.articles.get(articleId);
    if (!current || current.ownerUserId !== ownerUserId)
      return Promise.resolve({ kind: 'not_found' });
    if (!current.versions.some((version) => version.id === input.versionId)) {
      return Promise.resolve({ kind: 'invalid_version' });
    }
    const review: ArticleReviewRecord = {
      id: crypto.randomUUID(),
      ownerUserId,
      articleId,
      versionId: input.versionId,
      capabilityKey: input.capabilityKey,
      verdict: input.verdict,
      summary: input.summary,
      findings: input.findings,
      createdAt: new Date(),
    };
    const updated = { ...current, reviews: [review, ...current.reviews] };
    this.articles.set(articleId, updated);
    return Promise.resolve({ kind: 'ok', article: cloneArticle(updated) });
  }

  update(
    ownerUserId: string,
    articleId: string,
    input: UpdateArticle,
  ): Promise<ArticleMutationResult> {
    const current = this.articles.get(articleId);
    if (!current || current.ownerUserId !== ownerUserId || current.object.status === 'deleted') {
      return Promise.resolve({ kind: 'not_found' });
    }
    const now = new Date();
    const updated: OwnedArticle = {
      ...current,
      object: {
        ...current.object,
        status: input.status,
        archivedAt: input.status === 'archived' ? now : null,
        updatedAt: now,
      },
      article: { ...current.article, updatedAt: now },
    };
    this.articles.set(articleId, updated);
    return Promise.resolve({ kind: 'ok', article: cloneArticle(updated) });
  }
}
