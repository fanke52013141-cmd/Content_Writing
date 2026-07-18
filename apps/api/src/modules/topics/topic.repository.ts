import type {
  CreateTopic,
  LinkTopicProject,
  Topic,
  TopicProjectLink,
  UpdateTopic,
} from '@content-writing/contracts';
import { TopicStore, type TopicAggregateRecord } from '@content-writing/database';

export type TopicRepositoryMutation =
  | { kind: 'ok'; topic: Topic }
  | { kind: 'not_found' }
  | { kind: 'not_editable' }
  | { kind: 'invalid_context' };

export interface TopicRepository {
  create(ownerUserId: string, input: CreateTopic): Promise<Topic | null>;
  list(ownerUserId: string): Promise<readonly Topic[]>;
  get(ownerUserId: string, topicId: string): Promise<Topic | null>;
  update(
    ownerUserId: string,
    topicId: string,
    input: UpdateTopic,
  ): Promise<TopicRepositoryMutation>;
  linkProject(
    ownerUserId: string,
    topicId: string,
    projectId: string,
    input: LinkTopicProject,
  ): Promise<TopicRepositoryMutation>;
  unlinkProject(
    ownerUserId: string,
    topicId: string,
    projectId: string,
  ): Promise<TopicRepositoryMutation>;
  close?(): Promise<void>;
}

export const TOPIC_REPOSITORY = Symbol('TOPIC_REPOSITORY');

function topicFromAggregate(record: TopicAggregateRecord): Topic {
  if (record.object.status !== 'active' && record.object.status !== 'archived') {
    throw new Error('Topic has an invalid public lifecycle status.');
  }
  return {
    id: record.topic.id,
    accountId: record.topic.accountId,
    title: record.topic.title,
    angle: record.topic.angle,
    targetAudience: record.topic.targetAudience,
    contentGoal: record.topic.contentGoal,
    keywords: record.topic.keywords,
    source: record.topic.source,
    sourceGenerationId: record.topic.sourceGenerationId,
    status: record.object.status,
    projectLinks: [...record.projectLinks],
    createdAt: record.object.createdAt.toISOString(),
    updatedAt: record.object.updatedAt.toISOString(),
    archivedAt: record.object.archivedAt?.toISOString() ?? null,
  };
}

export class PostgresTopicRepository implements TopicRepository {
  private readonly store: TopicStore;

  constructor(databaseUrl: string) {
    this.store = new TopicStore(databaseUrl);
  }

  async create(ownerUserId: string, input: CreateTopic): Promise<Topic | null> {
    const topic = await this.store.create(ownerUserId, input);
    return topic ? topicFromAggregate(topic) : null;
  }

  async list(ownerUserId: string): Promise<readonly Topic[]> {
    return (await this.store.list(ownerUserId)).map(topicFromAggregate);
  }

  async get(ownerUserId: string, topicId: string): Promise<Topic | null> {
    const topic = await this.store.get(ownerUserId, topicId);
    return topic ? topicFromAggregate(topic) : null;
  }

  async update(
    ownerUserId: string,
    topicId: string,
    input: UpdateTopic,
  ): Promise<TopicRepositoryMutation> {
    const result = await this.store.update(ownerUserId, topicId, input);
    return result.kind === 'ok' ? { kind: 'ok', topic: topicFromAggregate(result.topic) } : result;
  }

  async linkProject(
    ownerUserId: string,
    topicId: string,
    projectId: string,
    input: LinkTopicProject,
  ): Promise<TopicRepositoryMutation> {
    const result = await this.store.linkProject(ownerUserId, topicId, projectId, input);
    return result.kind === 'ok' ? { kind: 'ok', topic: topicFromAggregate(result.topic) } : result;
  }

  async unlinkProject(
    ownerUserId: string,
    topicId: string,
    projectId: string,
  ): Promise<TopicRepositoryMutation> {
    const result = await this.store.unlinkProject(ownerUserId, topicId, projectId);
    return result.kind === 'ok' ? { kind: 'ok', topic: topicFromAggregate(result.topic) } : result;
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

interface OwnedTopic extends Topic {
  ownerUserId: string;
}

export class InMemoryTopicRepository implements TopicRepository {
  private readonly topics = new Map<string, OwnedTopic>();

  constructor(
    private readonly accountIds = new Set<string>(),
    private readonly projectTitles = new Map<string, string>(),
  ) {}

  create(ownerUserId: string, input: CreateTopic): Promise<Topic | null> {
    if (input.accountId && !this.accountIds.has(input.accountId)) return Promise.resolve(null);
    const now = new Date().toISOString();
    const topic: OwnedTopic = {
      id: crypto.randomUUID(),
      ownerUserId,
      accountId: input.accountId ?? null,
      title: input.title,
      angle: input.angle,
      targetAudience: input.targetAudience,
      contentGoal: input.contentGoal,
      keywords: input.keywords,
      source: 'manual',
      sourceGenerationId: null,
      status: 'active',
      projectLinks: [],
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.topics.set(topic.id, topic);
    return Promise.resolve(topic);
  }

  list(ownerUserId: string): Promise<readonly Topic[]> {
    return Promise.resolve(
      [...this.topics.values()].filter((topic) => topic.ownerUserId === ownerUserId),
    );
  }

  get(ownerUserId: string, topicId: string): Promise<Topic | null> {
    const topic = this.topics.get(topicId);
    return Promise.resolve(topic?.ownerUserId === ownerUserId ? topic : null);
  }

  update(
    ownerUserId: string,
    topicId: string,
    input: UpdateTopic,
  ): Promise<TopicRepositoryMutation> {
    const topic = this.topics.get(topicId);
    if (!topic || topic.ownerUserId !== ownerUserId) return Promise.resolve({ kind: 'not_found' });
    const contentChange = Object.keys(input).some((key) => key !== 'status');
    if (topic.source === 'ai' && contentChange) return Promise.resolve({ kind: 'not_editable' });
    if (input.accountId && !this.accountIds.has(input.accountId)) {
      return Promise.resolve({ kind: 'invalid_context' });
    }
    const now = new Date().toISOString();
    const updated: OwnedTopic = {
      ...topic,
      ...input,
      archivedAt:
        input.status === 'archived' ? now : input.status === undefined ? topic.archivedAt : null,
      updatedAt: now,
    };
    this.topics.set(topicId, updated);
    return Promise.resolve({ kind: 'ok', topic: updated });
  }

  linkProject(
    ownerUserId: string,
    topicId: string,
    projectId: string,
    input: LinkTopicProject,
  ): Promise<TopicRepositoryMutation> {
    const topic = this.topics.get(topicId);
    if (
      !topic ||
      topic.ownerUserId !== ownerUserId ||
      topic.status !== 'active' ||
      !this.projectTitles.has(projectId)
    ) {
      return Promise.resolve({ kind: 'invalid_context' });
    }
    if (input.isPrimary) {
      for (const [id, existingTopic] of this.topics) {
        if (id === topicId) continue;
        this.topics.set(id, {
          ...existingTopic,
          projectLinks: existingTopic.projectLinks.map((link) =>
            link.projectId === projectId ? { ...link, isPrimary: false } : link,
          ),
        });
      }
    }
    const otherLinks = topic.projectLinks
      .map((link) =>
        input.isPrimary && link.projectId === projectId ? { ...link, isPrimary: false } : link,
      )
      .filter((link) => link.projectId !== projectId);
    const link: TopicProjectLink = {
      projectId,
      projectTitle: this.projectTitles.get(projectId) ?? 'Content project',
      isPrimary: input.isPrimary,
    };
    const updated: OwnedTopic = {
      ...topic,
      projectLinks: [...otherLinks, link],
      updatedAt: new Date().toISOString(),
    };
    this.topics.set(topicId, updated);
    return Promise.resolve({ kind: 'ok', topic: updated });
  }

  unlinkProject(
    ownerUserId: string,
    topicId: string,
    projectId: string,
  ): Promise<TopicRepositoryMutation> {
    const topic = this.topics.get(topicId);
    if (!topic || topic.ownerUserId !== ownerUserId) return Promise.resolve({ kind: 'not_found' });
    const updated: OwnedTopic = {
      ...topic,
      projectLinks: topic.projectLinks.filter((link) => link.projectId !== projectId),
      updatedAt: new Date().toISOString(),
    };
    this.topics.set(topicId, updated);
    return Promise.resolve({ kind: 'ok', topic: updated });
  }
}
