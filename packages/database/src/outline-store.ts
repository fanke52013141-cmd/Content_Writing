import type { CreateOutline, UpdateOutline } from '@content-writing/contracts';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { createDatabase } from './client.js';
import {
  contentObjects,
  contentRelations,
  contentProjects,
  outlines,
  topics,
  type ContentObjectRecord,
  type OutlineRecord,
} from './schema.js';

export interface OutlineAggregateRecord {
  object: ContentObjectRecord;
  outline: OutlineRecord;
}

export type OutlineMutationResult =
  | { kind: 'ok'; outline: OutlineAggregateRecord }
  | { kind: 'not_found' }
  | { kind: 'invalid_context' };

interface OutlineBaseRecord {
  object: ContentObjectRecord;
  outline: OutlineRecord;
}

export class OutlineStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  private async getBase(ownerUserId: string, outlineId: string): Promise<OutlineBaseRecord | null> {
    const [row] = await this.client.db
      .select({ object: contentObjects, outline: outlines })
      .from(outlines)
      .innerJoin(contentObjects, eq(contentObjects.id, outlines.id))
      .where(
        and(
          eq(outlines.id, outlineId),
          eq(outlines.ownerUserId, ownerUserId),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async create(ownerUserId: string, input: CreateOutline): Promise<OutlineAggregateRecord | null> {
    return this.client.db.transaction(async (transaction) => {
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
      const id = crypto.randomUUID();
      const [object] = await transaction
        .insert(contentObjects)
        .values({ id, ownerUserId, objectType: 'outline' })
        .returning();
      const [outline] = await transaction
        .insert(outlines)
        .values({
          id,
          ownerUserId,
          projectId: input.projectId ?? null,
          topicId: input.topicId ?? null,
          title: input.title,
          summary: input.summary,
          sections: input.sections,
          source: 'manual',
          sourceGenerationId: null,
        })
        .returning();
      if (!object || !outline) throw new Error('Outline creation failed.');
      if (input.projectId) {
        await transaction.insert(contentRelations).values({
          ownerUserId,
          fromObjectId: input.projectId,
          toObjectId: id,
          relationType: 'project_has_outline',
          projectScopeId: input.projectId,
        });
      }
      return { object, outline };
    });
  }

  async list(ownerUserId: string): Promise<readonly OutlineAggregateRecord[]> {
    return this.client.db
      .select({ object: contentObjects, outline: outlines })
      .from(outlines)
      .innerJoin(contentObjects, eq(contentObjects.id, outlines.id))
      .where(
        and(
          eq(outlines.ownerUserId, ownerUserId),
          eq(contentObjects.objectType, 'outline'),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .orderBy(desc(contentObjects.updatedAt));
  }

  async get(ownerUserId: string, outlineId: string): Promise<OutlineAggregateRecord | null> {
    return this.getBase(ownerUserId, outlineId);
  }

  async update(
    ownerUserId: string,
    outlineId: string,
    input: UpdateOutline,
  ): Promise<OutlineMutationResult> {
    const result = await this.client.db.transaction(async (transaction) => {
      const locked = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${outlineId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'outline' AND status <> 'deleted'
        FOR UPDATE
      `);
      if (locked.length === 0) return 'not_found' as const;
      const outlinePatch = {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.sections === undefined ? {} : { sections: input.sections }),
      };
      if (Object.keys(outlinePatch).length > 0) {
        await transaction.update(outlines).set(outlinePatch).where(eq(outlines.id, outlineId));
      }
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
        .where(eq(contentObjects.id, outlineId));
      return 'ok' as const;
    });
    if (result !== 'ok') return { kind: result };
    const outline = await this.get(ownerUserId, outlineId);
    return outline ? { kind: 'ok', outline } : { kind: 'not_found' };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

interface OwnedOutline extends OutlineAggregateRecord {
  ownerUserId: string;
}

function cloneOutline(outline: OwnedOutline): OwnedOutline {
  return structuredClone(outline);
}

export class InMemoryOutlineRepository {
  private readonly outlines = new Map<string, OwnedOutline>();

  constructor(
    private readonly projectIds = new Set<string>(),
    private readonly topicIds = new Set<string>(),
  ) {}

  create(ownerUserId: string, input: CreateOutline): Promise<OutlineAggregateRecord | null> {
    if (input.projectId && !this.projectIds.has(input.projectId)) return Promise.resolve(null);
    if (input.topicId && !this.topicIds.has(input.topicId)) return Promise.resolve(null);
    const now = new Date();
    const id = crypto.randomUUID();
    const outline = {
      object: {
        id,
        ownerUserId,
        objectType: 'outline' as const,
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
      },
      outline: {
        id,
        ownerUserId,
        projectId: input.projectId ?? null,
        topicId: input.topicId ?? null,
        title: input.title,
        summary: input.summary,
        sections: input.sections,
        source: 'manual' as const,
        sourceGenerationId: null,
        createdAt: now,
        updatedAt: now,
      },
    } satisfies OutlineAggregateRecord;
    const stored = { ...outline, ownerUserId };
    this.outlines.set(id, stored);
    return Promise.resolve(cloneOutline(stored));
  }

  list(ownerUserId: string): Promise<readonly OutlineAggregateRecord[]> {
    return Promise.resolve(
      [...this.outlines.values()]
        .filter((item) => item.ownerUserId === ownerUserId && item.object.status !== 'deleted')
        .sort((a, b) => b.object.updatedAt.getTime() - a.object.updatedAt.getTime())
        .map(cloneOutline),
    );
  }

  get(ownerUserId: string, outlineId: string): Promise<OutlineAggregateRecord | null> {
    const outline = this.outlines.get(outlineId);
    return Promise.resolve(
      outline?.ownerUserId === ownerUserId && outline.object.status !== 'deleted'
        ? cloneOutline(outline)
        : null,
    );
  }

  update(
    ownerUserId: string,
    outlineId: string,
    input: UpdateOutline,
  ): Promise<OutlineMutationResult> {
    const current = this.outlines.get(outlineId);
    if (!current || current.ownerUserId !== ownerUserId || current.object.status === 'deleted') {
      return Promise.resolve({ kind: 'not_found' });
    }
    const now = new Date();
    const updated: OwnedOutline = {
      ...current,
      object: {
        ...current.object,
        status: input.status ?? current.object.status,
        archivedAt:
          input.status === 'archived'
            ? now
            : input.status === 'active'
              ? null
              : current.object.archivedAt,
        updatedAt: now,
      },
      outline: {
        ...current.outline,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.sections === undefined ? {} : { sections: input.sections }),
        updatedAt: now,
      },
    };
    this.outlines.set(outlineId, updated);
    return Promise.resolve({ kind: 'ok', outline: cloneOutline(updated) });
  }
}
