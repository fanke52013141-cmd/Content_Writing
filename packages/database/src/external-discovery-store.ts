import type {
  ExternalSearchProviderItem,
  ExternalSourceKind,
  HotTopicProviderItem,
  HotTopicSource,
  UpdateExternalSourcePolicy,
} from '@content-writing/contracts';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { createDatabase } from './client.js';
import {
  externalSearchResults,
  externalSearchRuns,
  externalSourcePolicies,
  hotTopicItems,
  type ExternalSearchResultRecord,
  type ExternalSearchRunRecord,
  type ExternalSourcePolicyRecord,
  type HotTopicItemRecord,
} from './schema.js';

const policySeeds = [
  ['hot_topic', 'douyin', '抖音', 'https://www.douyin.com/hot'],
  ['hot_topic', 'kuaishou', '快手', 'https://www.kuaishou.com/'],
  ['hot_topic', 'weibo', '微博', 'https://s.weibo.com/top/summary'],
  ['hot_topic', 'zhihu', '知乎', 'https://www.zhihu.com/hot'],
  ['hot_topic', 'baidu', '百度', 'https://top.baidu.com/board'],
  ['hot_topic', 'toutiao', '今日头条', 'https://www.toutiao.com/trending/'],
  ['hot_topic', 'thepaper', '澎湃新闻', 'https://www.thepaper.cn/'],
  ['hot_topic', '36kr', '36Kr', 'https://36kr.com/hot-list/catalog'],
  ['hot_topic', 'huxiu', '虎嗅', 'https://www.huxiu.com/'],
  ['hot_topic', 'bilibili', '哔哩哔哩', 'https://www.bilibili.com/v/popular/rank/all'],
  ['search', 'searxng', 'SearXNG 外部搜索', 'https://docs.searxng.org/'],
] as const satisfies readonly (readonly [ExternalSourceKind, string, string, string])[];

export interface ExternalSearchAggregateRecord {
  run: ExternalSearchRunRecord;
  results: readonly ExternalSearchResultRecord[];
}

export class ExternalDiscoveryStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  async ensurePolicies(ownerUserId: string): Promise<void> {
    await this.client.db
      .insert(externalSourcePolicies)
      .values(
        policySeeds.map(([kind, sourceKey, displayName, referenceUrl]) => ({
          ownerUserId,
          kind,
          sourceKey,
          displayName,
          referenceUrl,
        })),
      )
      .onConflictDoNothing();
  }

  async listPolicies(ownerUserId: string): Promise<readonly ExternalSourcePolicyRecord[]> {
    await this.ensurePolicies(ownerUserId);
    return this.client.db
      .select()
      .from(externalSourcePolicies)
      .where(eq(externalSourcePolicies.ownerUserId, ownerUserId))
      .orderBy(externalSourcePolicies.kind, externalSourcePolicies.createdAt);
  }

  async getPolicy(
    ownerUserId: string,
    kind: ExternalSourceKind,
    sourceKey: string,
  ): Promise<ExternalSourcePolicyRecord | null> {
    await this.ensurePolicies(ownerUserId);
    const [policy] = await this.client.db
      .select()
      .from(externalSourcePolicies)
      .where(
        and(
          eq(externalSourcePolicies.ownerUserId, ownerUserId),
          eq(externalSourcePolicies.kind, kind),
          eq(externalSourcePolicies.sourceKey, sourceKey),
        ),
      )
      .limit(1);
    return policy ?? null;
  }

  async updatePolicy(
    ownerUserId: string,
    policyId: string,
    input: UpdateExternalSourcePolicy,
  ): Promise<ExternalSourcePolicyRecord | null> {
    const [current] = await this.client.db
      .select()
      .from(externalSourcePolicies)
      .where(
        and(
          eq(externalSourcePolicies.ownerUserId, ownerUserId),
          eq(externalSourcePolicies.id, policyId),
        ),
      )
      .limit(1);
    if (!current) return null;
    const nextStatus = input.termsReviewStatus ?? current.termsReviewStatus;
    const [updated] = await this.client.db
      .update(externalSourcePolicies)
      .set({
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.termsReviewStatus === undefined
          ? {}
          : { termsReviewStatus: input.termsReviewStatus }),
        ...(input.reviewNote === undefined ? {} : { reviewNote: input.reviewNote }),
        reviewedAt: nextStatus === 'pending' ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(externalSourcePolicies.ownerUserId, ownerUserId),
          eq(externalSourcePolicies.id, policyId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async saveHotTopics(
    ownerUserId: string,
    providerKey: string,
    items: readonly HotTopicProviderItem[],
  ): Promise<readonly HotTopicItemRecord[]> {
    if (items.length === 0) return [];
    const fetchedAt = new Date();
    await this.client.db
      .insert(hotTopicItems)
      .values(
        items.map((item, index) => ({
          ownerUserId,
          source: item.source,
          externalId: item.externalId,
          title: item.title,
          url: item.url,
          description: item.description ?? '',
          popularity: item.popularity,
          rank: index + 1,
          observedAt: new Date(item.observedAt),
          fetchedAt,
          providerKey,
        })),
      )
      .onConflictDoUpdate({
        target: [hotTopicItems.ownerUserId, hotTopicItems.source, hotTopicItems.externalId],
        set: {
          title: sql`excluded.title`,
          url: sql`excluded.url`,
          description: sql`excluded.description`,
          popularity: sql`excluded.popularity`,
          rank: sql`excluded.rank`,
          observedAt: sql`excluded.observed_at`,
          fetchedAt: sql`excluded.fetched_at`,
          providerKey: sql`excluded.provider_key`,
        },
      });
    return this.listHotTopics(ownerUserId, items[0]!.source, items.length);
  }

  async listHotTopics(
    ownerUserId: string,
    source: HotTopicSource | undefined,
    limit: number,
  ): Promise<readonly HotTopicItemRecord[]> {
    const condition = source
      ? and(eq(hotTopicItems.ownerUserId, ownerUserId), eq(hotTopicItems.source, source))
      : eq(hotTopicItems.ownerUserId, ownerUserId);
    return this.client.db
      .select()
      .from(hotTopicItems)
      .where(condition)
      .orderBy(desc(hotTopicItems.fetchedAt), hotTopicItems.rank)
      .limit(limit);
  }

  async getHotTopic(ownerUserId: string, itemId: string): Promise<HotTopicItemRecord | null> {
    const [item] = await this.client.db
      .select()
      .from(hotTopicItems)
      .where(and(eq(hotTopicItems.ownerUserId, ownerUserId), eq(hotTopicItems.id, itemId)))
      .limit(1);
    return item ?? null;
  }

  async createSearchRun(
    ownerUserId: string,
    query: string,
    providerKey: string,
    items: readonly ExternalSearchProviderItem[],
  ): Promise<ExternalSearchAggregateRecord> {
    return this.client.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(externalSearchRuns)
        .values({ ownerUserId, query, providerKey })
        .returning();
      if (!run) throw new Error('Search run was not created.');
      const results =
        items.length === 0
          ? []
          : await tx
              .insert(externalSearchResults)
              .values(
                items.map((item, index) => ({
                  runId: run.id,
                  rank: index + 1,
                  title: item.title,
                  url: item.url,
                  snippet: item.snippet,
                  domain: item.domain,
                  publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
                })),
              )
              .returning();
      return { run, results };
    });
  }

  async listSearchRuns(
    ownerUserId: string,
    limit: number,
  ): Promise<readonly ExternalSearchAggregateRecord[]> {
    const runs = await this.client.db
      .select()
      .from(externalSearchRuns)
      .where(eq(externalSearchRuns.ownerUserId, ownerUserId))
      .orderBy(desc(externalSearchRuns.createdAt))
      .limit(limit);
    if (runs.length === 0) return [];
    const results = await this.client.db
      .select()
      .from(externalSearchResults)
      .where(
        inArray(
          externalSearchResults.runId,
          runs.map((run) => run.id),
        ),
      )
      .orderBy(externalSearchResults.rank);
    return runs.map((run) => ({
      run,
      results: results.filter((result) => result.runId === run.id),
    }));
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
