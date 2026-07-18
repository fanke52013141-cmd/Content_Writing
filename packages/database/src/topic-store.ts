import type { CreateTopic, LinkTopicProject, UpdateTopic } from '@content-writing/contracts';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { createDatabase } from './client.js';
import {
  accounts,
  contentObjects,
  contentProjects,
  contentRelations,
  topics,
  type ContentObjectRecord,
  type TopicRecord,
} from './schema.js';

export interface TopicProjectAggregateRecord {
  projectId: string;
  projectTitle: string;
  isPrimary: boolean;
}

export interface TopicAggregateRecord {
  object: ContentObjectRecord;
  topic: TopicRecord;
  projectLinks: readonly TopicProjectAggregateRecord[];
}

export type TopicMutationResult =
  | { kind: 'ok'; topic: TopicAggregateRecord }
  | { kind: 'not_found' }
  | { kind: 'not_editable' }
  | { kind: 'invalid_context' };

interface TopicBaseRecord {
  object: ContentObjectRecord;
  topic: TopicRecord;
}

export class TopicStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  private async loadProjectLinks(
    topicIds: readonly string[],
  ): Promise<Map<string, TopicProjectAggregateRecord[]>> {
    const links = new Map<string, TopicProjectAggregateRecord[]>();
    if (topicIds.length === 0) return links;
    const rows = await this.client.db
      .select({
        topicId: contentRelations.toObjectId,
        projectId: contentRelations.fromObjectId,
        projectTitle: contentProjects.title,
        isPrimary: contentRelations.isPrimary,
      })
      .from(contentRelations)
      .innerJoin(contentProjects, eq(contentProjects.id, contentRelations.fromObjectId))
      .where(
        and(
          inArray(contentRelations.toObjectId, [...topicIds]),
          eq(contentRelations.relationType, 'project_has_topic'),
          isNull(contentRelations.endedAt),
        ),
      );
    for (const row of rows) {
      const topicLinks = links.get(row.topicId) ?? [];
      topicLinks.push({
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        isPrimary: row.isPrimary,
      });
      links.set(row.topicId, topicLinks);
    }
    return links;
  }

  private async getBase(ownerUserId: string, topicId: string): Promise<TopicBaseRecord | null> {
    const [row] = await this.client.db
      .select({ object: contentObjects, topic: topics })
      .from(topics)
      .innerJoin(contentObjects, eq(contentObjects.id, topics.id))
      .where(
        and(
          eq(topics.id, topicId),
          eq(contentObjects.ownerUserId, ownerUserId),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async create(ownerUserId: string, input: CreateTopic): Promise<TopicAggregateRecord | null> {
    return this.client.db.transaction(async (transaction) => {
      if (input.accountId) {
        const [account] = await transaction
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.id, input.accountId),
              eq(accounts.ownerUserId, ownerUserId),
              ne(accounts.status, 'archived'),
            ),
          )
          .limit(1);
        if (!account) return null;
      }
      const topicId = crypto.randomUUID();
      const [object] = await transaction
        .insert(contentObjects)
        .values({ id: topicId, ownerUserId, objectType: 'topic' })
        .returning();
      const [topic] = await transaction
        .insert(topics)
        .values({ id: topicId, ownerUserId, source: 'manual', ...input })
        .returning();
      if (!object || !topic) throw new Error('Topic creation failed.');
      return { object, topic, projectLinks: [] };
    });
  }

  async list(ownerUserId: string): Promise<readonly TopicAggregateRecord[]> {
    const rows = await this.client.db
      .select({ object: contentObjects, topic: topics })
      .from(topics)
      .innerJoin(contentObjects, eq(contentObjects.id, topics.id))
      .where(
        and(
          eq(contentObjects.ownerUserId, ownerUserId),
          eq(contentObjects.objectType, 'topic'),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .orderBy(desc(contentObjects.updatedAt));
    const links = await this.loadProjectLinks(rows.map((row) => row.topic.id));
    return rows.map((row) => ({ ...row, projectLinks: links.get(row.topic.id) ?? [] }));
  }

  async get(ownerUserId: string, topicId: string): Promise<TopicAggregateRecord | null> {
    const row = await this.getBase(ownerUserId, topicId);
    if (!row) return null;
    const links = await this.loadProjectLinks([topicId]);
    return { ...row, projectLinks: links.get(topicId) ?? [] };
  }

  async update(
    ownerUserId: string,
    topicId: string,
    input: UpdateTopic,
  ): Promise<TopicMutationResult> {
    const result = await this.client.db.transaction(async (transaction) => {
      const locked = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${topicId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'topic' AND status <> 'deleted'
        FOR UPDATE
      `);
      if (locked.length === 0) return 'not_found' as const;
      const [topic] = await transaction
        .select()
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1);
      if (!topic) return 'not_found' as const;
      const contentChange = Object.keys(input).some((key) => key !== 'status');
      if (topic.source === 'ai' && contentChange) return 'not_editable' as const;
      if (input.accountId) {
        const [account] = await transaction
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.id, input.accountId),
              eq(accounts.ownerUserId, ownerUserId),
              ne(accounts.status, 'archived'),
            ),
          )
          .limit(1);
        if (!account) return 'invalid_context' as const;
      }
      await transaction
        .update(topics)
        .set({
          ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.angle === undefined ? {} : { angle: input.angle }),
          ...(input.targetAudience === undefined ? {} : { targetAudience: input.targetAudience }),
          ...(input.contentGoal === undefined ? {} : { contentGoal: input.contentGoal }),
          ...(input.keywords === undefined ? {} : { keywords: input.keywords }),
        })
        .where(eq(topics.id, topicId));
      const now = new Date();
      await transaction
        .update(contentObjects)
        .set({
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.status === undefined
            ? {}
            : { archivedAt: input.status === 'archived' ? now : null }),
          updatedAt: now,
        })
        .where(eq(contentObjects.id, topicId));
      return 'ok' as const;
    });
    if (result !== 'ok') return { kind: result };
    const topic = await this.get(ownerUserId, topicId);
    return topic ? { kind: 'ok', topic } : { kind: 'not_found' };
  }

  async linkProject(
    ownerUserId: string,
    topicId: string,
    projectId: string,
    input: LinkTopicProject,
  ): Promise<TopicMutationResult> {
    const linked = await this.client.db.transaction(async (transaction) => {
      const project = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${projectId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'project' AND status IN ('active', 'completed')
        FOR UPDATE
      `);
      const topic = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${topicId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'topic' AND status = 'active'
      `);
      if (project.length === 0 || topic.length === 0) return false;
      if (input.isPrimary) {
        await transaction
          .update(contentRelations)
          .set({ isPrimary: false })
          .where(
            and(
              eq(contentRelations.fromObjectId, projectId),
              eq(contentRelations.relationType, 'project_has_topic'),
              isNull(contentRelations.endedAt),
            ),
          );
      }
      const [existing] = await transaction
        .select({ id: contentRelations.id })
        .from(contentRelations)
        .where(
          and(
            eq(contentRelations.fromObjectId, projectId),
            eq(contentRelations.toObjectId, topicId),
            eq(contentRelations.relationType, 'project_has_topic'),
            isNull(contentRelations.endedAt),
          ),
        )
        .limit(1);
      if (existing) {
        await transaction
          .update(contentRelations)
          .set({ isPrimary: input.isPrimary })
          .where(eq(contentRelations.id, existing.id));
      } else {
        await transaction.insert(contentRelations).values({
          ownerUserId,
          fromObjectId: projectId,
          toObjectId: topicId,
          relationType: 'project_has_topic',
          projectScopeId: projectId,
          isPrimary: input.isPrimary,
        });
      }
      await transaction
        .update(contentObjects)
        .set({ updatedAt: new Date() })
        .where(inArray(contentObjects.id, [topicId, projectId]));
      return true;
    });
    if (!linked) return { kind: 'invalid_context' };
    const topic = await this.get(ownerUserId, topicId);
    return topic ? { kind: 'ok', topic } : { kind: 'not_found' };
  }

  async unlinkProject(
    ownerUserId: string,
    topicId: string,
    projectId: string,
  ): Promise<TopicMutationResult> {
    if (!(await this.getBase(ownerUserId, topicId))) return { kind: 'not_found' };
    await this.client.db
      .update(contentRelations)
      .set({ endedAt: new Date(), isPrimary: false })
      .where(
        and(
          eq(contentRelations.ownerUserId, ownerUserId),
          eq(contentRelations.fromObjectId, projectId),
          eq(contentRelations.toObjectId, topicId),
          eq(contentRelations.relationType, 'project_has_topic'),
          isNull(contentRelations.endedAt),
        ),
      );
    const topic = await this.get(ownerUserId, topicId);
    return topic ? { kind: 'ok', topic } : { kind: 'not_found' };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
