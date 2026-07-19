import type {
  ExternalSearchProviderItem,
  ExternalSearchRun,
  ExternalSourceKind,
  ExternalSourcePolicy,
  HotTopicItem,
  HotTopicProviderItem,
  HotTopicSource,
  UpdateExternalSourcePolicy,
} from '@content-writing/contracts';
import {
  ExternalDiscoveryStore,
  type ExternalSearchAggregateRecord,
  type ExternalSearchResultRecord,
  type ExternalSourcePolicyRecord,
  type HotTopicItemRecord,
} from '@content-writing/database';

export interface DiscoveryRepository {
  listPolicies(ownerUserId: string): Promise<readonly ExternalSourcePolicy[]>;
  getPolicy(
    ownerUserId: string,
    kind: ExternalSourceKind,
    sourceKey: string,
  ): Promise<ExternalSourcePolicy | null>;
  updatePolicy(
    ownerUserId: string,
    policyId: string,
    input: UpdateExternalSourcePolicy,
  ): Promise<ExternalSourcePolicy | null>;
  saveHotTopics(
    ownerUserId: string,
    providerKey: string,
    items: readonly HotTopicProviderItem[],
  ): Promise<readonly HotTopicItem[]>;
  listHotTopics(
    ownerUserId: string,
    source: HotTopicSource | undefined,
    limit: number,
  ): Promise<readonly HotTopicItem[]>;
  getHotTopic(ownerUserId: string, itemId: string): Promise<HotTopicItem | null>;
  createSearchRun(
    ownerUserId: string,
    query: string,
    providerKey: string,
    items: readonly ExternalSearchProviderItem[],
  ): Promise<ExternalSearchRun>;
  listSearchRuns(ownerUserId: string, limit: number): Promise<readonly ExternalSearchRun[]>;
  close?(): Promise<void>;
}

export const DISCOVERY_REPOSITORY = Symbol('DISCOVERY_REPOSITORY');

function policyFromRecord(record: ExternalSourcePolicyRecord): ExternalSourcePolicy {
  if (record.termsReviewStatus === 'not_applicable') {
    throw new Error('External source policies cannot use not_applicable review status.');
  }
  return {
    id: record.id,
    kind: record.kind,
    sourceKey: record.sourceKey,
    displayName: record.displayName,
    referenceUrl: record.referenceUrl,
    enabled: record.enabled,
    termsReviewStatus: record.termsReviewStatus,
    reviewNote: record.reviewNote,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function hotTopicFromRecord(record: HotTopicItemRecord): HotTopicItem {
  return {
    id: record.id,
    externalId: record.externalId,
    source: record.source,
    title: record.title,
    url: record.url,
    ...(record.description ? { description: record.description } : {}),
    ...(record.popularity === null ? {} : { popularity: record.popularity }),
    observedAt: record.observedAt.toISOString(),
    rank: record.rank,
    providerKey: record.providerKey,
    fetchedAt: record.fetchedAt.toISOString(),
  };
}

function searchResultFromRecord(record: ExternalSearchResultRecord) {
  return {
    id: record.id,
    rank: record.rank,
    title: record.title,
    url: record.url,
    snippet: record.snippet,
    domain: record.domain,
    publishedAt: record.publishedAt?.toISOString() ?? null,
  };
}

function searchRunFromRecord(record: ExternalSearchAggregateRecord): ExternalSearchRun {
  return {
    id: record.run.id,
    query: record.run.query,
    providerKey: record.run.providerKey,
    results: record.results.map(searchResultFromRecord),
    createdAt: record.run.createdAt.toISOString(),
  };
}

export class PostgresDiscoveryRepository implements DiscoveryRepository {
  private readonly store: ExternalDiscoveryStore;
  constructor(databaseUrl: string) {
    this.store = new ExternalDiscoveryStore(databaseUrl);
  }
  async listPolicies(ownerUserId: string) {
    return (await this.store.listPolicies(ownerUserId)).map(policyFromRecord);
  }
  async getPolicy(ownerUserId: string, kind: ExternalSourceKind, sourceKey: string) {
    const record = await this.store.getPolicy(ownerUserId, kind, sourceKey);
    return record ? policyFromRecord(record) : null;
  }
  async updatePolicy(ownerUserId: string, policyId: string, input: UpdateExternalSourcePolicy) {
    const record = await this.store.updatePolicy(ownerUserId, policyId, input);
    return record ? policyFromRecord(record) : null;
  }
  async saveHotTopics(
    ownerUserId: string,
    providerKey: string,
    items: readonly HotTopicProviderItem[],
  ) {
    return (await this.store.saveHotTopics(ownerUserId, providerKey, items)).map(
      hotTopicFromRecord,
    );
  }
  async listHotTopics(ownerUserId: string, source: HotTopicSource | undefined, limit: number) {
    return (await this.store.listHotTopics(ownerUserId, source, limit)).map(hotTopicFromRecord);
  }
  async getHotTopic(ownerUserId: string, itemId: string) {
    const record = await this.store.getHotTopic(ownerUserId, itemId);
    return record ? hotTopicFromRecord(record) : null;
  }
  async createSearchRun(
    ownerUserId: string,
    query: string,
    providerKey: string,
    items: readonly ExternalSearchProviderItem[],
  ) {
    return searchRunFromRecord(
      await this.store.createSearchRun(ownerUserId, query, providerKey, items),
    );
  }
  async listSearchRuns(ownerUserId: string, limit: number) {
    return (await this.store.listSearchRuns(ownerUserId, limit)).map(searchRunFromRecord);
  }
  close() {
    return this.store.close();
  }
}

interface OwnedPolicy extends ExternalSourcePolicy {
  ownerUserId: string;
}
interface OwnedHotTopic extends HotTopicItem {
  ownerUserId: string;
}
interface OwnedSearchRun extends ExternalSearchRun {
  ownerUserId: string;
}

const inMemoryPolicySeeds = [
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

export class InMemoryDiscoveryRepository implements DiscoveryRepository {
  private readonly policies = new Map<string, OwnedPolicy>();
  private readonly hotTopics = new Map<string, OwnedHotTopic>();
  private readonly searches = new Map<string, OwnedSearchRun>();

  private ensurePolicies(ownerUserId: string) {
    if ([...this.policies.values()].some((policy) => policy.ownerUserId === ownerUserId)) return;
    const now = new Date().toISOString();
    for (const [kind, sourceKey, displayName, referenceUrl] of inMemoryPolicySeeds) {
      const policy: OwnedPolicy = {
        id: crypto.randomUUID(),
        ownerUserId,
        kind,
        sourceKey,
        displayName,
        referenceUrl,
        enabled: false,
        termsReviewStatus: 'pending',
        reviewNote: '',
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.policies.set(policy.id, policy);
    }
  }

  listPolicies(ownerUserId: string): Promise<readonly ExternalSourcePolicy[]> {
    this.ensurePolicies(ownerUserId);
    return Promise.resolve(
      [...this.policies.values()].filter((policy) => policy.ownerUserId === ownerUserId),
    );
  }
  async getPolicy(ownerUserId: string, kind: ExternalSourceKind, sourceKey: string) {
    return (
      (await this.listPolicies(ownerUserId)).find(
        (policy) => policy.kind === kind && policy.sourceKey === sourceKey,
      ) ?? null
    );
  }
  updatePolicy(ownerUserId: string, policyId: string, input: UpdateExternalSourcePolicy) {
    this.ensurePolicies(ownerUserId);
    const current = this.policies.get(policyId);
    if (!current || current.ownerUserId !== ownerUserId) return Promise.resolve(null);
    const nextStatus = input.termsReviewStatus ?? current.termsReviewStatus;
    const updated: OwnedPolicy = {
      ...current,
      ...input,
      reviewedAt: nextStatus === 'pending' ? null : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.policies.set(policyId, updated);
    return Promise.resolve(updated);
  }
  saveHotTopics(
    ownerUserId: string,
    providerKey: string,
    items: readonly HotTopicProviderItem[],
  ): Promise<readonly HotTopicItem[]> {
    const fetchedAt = new Date().toISOString();
    return Promise.resolve(
      items.map((item, index) => {
        const existing = [...this.hotTopics.values()].find(
          (entry) =>
            entry.ownerUserId === ownerUserId &&
            entry.source === item.source &&
            entry.externalId === item.externalId,
        );
        const saved: OwnedHotTopic = {
          ...item,
          id: existing?.id ?? crypto.randomUUID(),
          ownerUserId,
          rank: index + 1,
          providerKey,
          fetchedAt,
        };
        this.hotTopics.set(saved.id, saved);
        return saved;
      }),
    );
  }
  listHotTopics(ownerUserId: string, source: HotTopicSource | undefined, limit: number) {
    return Promise.resolve(
      [...this.hotTopics.values()]
        .filter((item) => item.ownerUserId === ownerUserId && (!source || item.source === source))
        .sort(
          (left, right) => right.fetchedAt.localeCompare(left.fetchedAt) || left.rank - right.rank,
        )
        .slice(0, limit),
    );
  }
  getHotTopic(ownerUserId: string, itemId: string) {
    const item = this.hotTopics.get(itemId);
    return Promise.resolve(item?.ownerUserId === ownerUserId ? item : null);
  }
  createSearchRun(
    ownerUserId: string,
    query: string,
    providerKey: string,
    items: readonly ExternalSearchProviderItem[],
  ): Promise<ExternalSearchRun> {
    const run: OwnedSearchRun = {
      id: crypto.randomUUID(),
      ownerUserId,
      query,
      providerKey,
      results: items.map((item, index) => ({ ...item, id: crypto.randomUUID(), rank: index + 1 })),
      createdAt: new Date().toISOString(),
    };
    this.searches.set(run.id, run);
    return Promise.resolve(run);
  }
  listSearchRuns(ownerUserId: string, limit: number) {
    return Promise.resolve(
      [...this.searches.values()]
        .filter((run) => run.ownerUserId === ownerUserId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit),
    );
  }
}
