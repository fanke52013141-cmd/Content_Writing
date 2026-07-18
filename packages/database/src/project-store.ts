import type {
  CreateContentProject,
  LinkProjectAccount,
  UpdateContentProject,
} from '@content-writing/contracts';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { createDatabase } from './client.js';
import {
  accounts,
  contentObjects,
  contentProjects,
  projectAccounts,
  type ContentObjectRecord,
  type ContentProjectRecord,
} from './schema.js';

export interface ProjectAccountAggregateRecord {
  accountId: string;
  accountName: string;
  isPrimary: boolean;
}

export interface ProjectAggregateRecord {
  object: ContentObjectRecord;
  project: ContentProjectRecord;
  accountLinks: readonly ProjectAccountAggregateRecord[];
}

interface ProjectBaseRecord {
  object: ContentObjectRecord;
  project: ContentProjectRecord;
}

export class ProjectStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  private async loadAccountLinks(
    projectIds: readonly string[],
  ): Promise<Map<string, ProjectAccountAggregateRecord[]>> {
    const links = new Map<string, ProjectAccountAggregateRecord[]>();
    if (projectIds.length === 0) return links;
    const rows = await this.client.db
      .select({
        projectId: projectAccounts.projectId,
        accountId: projectAccounts.accountId,
        accountName: accounts.name,
        isPrimary: projectAccounts.isPrimary,
      })
      .from(projectAccounts)
      .innerJoin(accounts, eq(accounts.id, projectAccounts.accountId))
      .where(inArray(projectAccounts.projectId, [...projectIds]));
    for (const row of rows) {
      const projectLinks = links.get(row.projectId) ?? [];
      projectLinks.push({
        accountId: row.accountId,
        accountName: row.accountName,
        isPrimary: row.isPrimary,
      });
      links.set(row.projectId, projectLinks);
    }
    return links;
  }

  private async getBase(ownerUserId: string, projectId: string): Promise<ProjectBaseRecord | null> {
    const [row] = await this.client.db
      .select({ object: contentObjects, project: contentProjects })
      .from(contentProjects)
      .innerJoin(contentObjects, eq(contentObjects.id, contentProjects.id))
      .where(
        and(
          eq(contentProjects.id, projectId),
          eq(contentObjects.ownerUserId, ownerUserId),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async create(
    ownerUserId: string,
    input: CreateContentProject,
  ): Promise<ProjectAggregateRecord | null> {
    return this.client.db.transaction(async (transaction) => {
      if (input.primaryAccountId) {
        const [account] = await transaction
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.id, input.primaryAccountId),
              eq(accounts.ownerUserId, ownerUserId),
              ne(accounts.status, 'archived'),
            ),
          )
          .limit(1);
        if (!account) return null;
      }

      const projectId = crypto.randomUUID();
      const [object] = await transaction
        .insert(contentObjects)
        .values({ id: projectId, ownerUserId, objectType: 'project' })
        .returning();
      const [project] = await transaction
        .insert(contentProjects)
        .values({
          id: projectId,
          ownerUserId,
          title: input.title,
          creationOrigin: input.creationOrigin,
          originNote: input.originNote,
        })
        .returning();
      if (!object || !project) throw new Error('Content project creation failed.');
      if (input.primaryAccountId) {
        await transaction.insert(projectAccounts).values({
          projectId,
          accountId: input.primaryAccountId,
          ownerUserId,
          isPrimary: true,
        });
      }
      const accountLinks = input.primaryAccountId
        ? await transaction
            .select({
              accountId: projectAccounts.accountId,
              accountName: accounts.name,
              isPrimary: projectAccounts.isPrimary,
            })
            .from(projectAccounts)
            .innerJoin(accounts, eq(accounts.id, projectAccounts.accountId))
            .where(eq(projectAccounts.projectId, projectId))
        : [];
      return { object, project, accountLinks };
    });
  }

  async list(ownerUserId: string): Promise<readonly ProjectAggregateRecord[]> {
    const rows = await this.client.db
      .select({ object: contentObjects, project: contentProjects })
      .from(contentProjects)
      .innerJoin(contentObjects, eq(contentObjects.id, contentProjects.id))
      .where(
        and(
          eq(contentObjects.ownerUserId, ownerUserId),
          eq(contentObjects.objectType, 'project'),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .orderBy(desc(contentObjects.updatedAt));
    const links = await this.loadAccountLinks(rows.map((row) => row.project.id));
    return rows.map((row) => ({
      ...row,
      accountLinks: links.get(row.project.id) ?? [],
    }));
  }

  async get(ownerUserId: string, projectId: string): Promise<ProjectAggregateRecord | null> {
    const row = await this.getBase(ownerUserId, projectId);
    if (!row) return null;
    const links = await this.loadAccountLinks([projectId]);
    return { ...row, accountLinks: links.get(projectId) ?? [] };
  }

  async update(
    ownerUserId: string,
    projectId: string,
    input: UpdateContentProject,
  ): Promise<ProjectAggregateRecord | null> {
    const updated = await this.client.db.transaction(async (transaction) => {
      const locked = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${projectId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'project' AND status <> 'deleted'
        FOR UPDATE
      `);
      if (locked.length === 0) return false;
      const now = new Date();
      if (
        input.title !== undefined ||
        input.originNote !== undefined ||
        input.status !== undefined
      ) {
        await transaction
          .update(contentProjects)
          .set({
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.originNote === undefined ? {} : { originNote: input.originNote }),
            ...(input.status === 'completed'
              ? { completedAt: now }
              : input.status === 'active'
                ? { completedAt: null }
                : {}),
          })
          .where(eq(contentProjects.id, projectId));
      }
      await transaction
        .update(contentObjects)
        .set({
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.status === undefined
            ? {}
            : { archivedAt: input.status === 'archived' ? now : null }),
          updatedAt: now,
        })
        .where(eq(contentObjects.id, projectId));
      return true;
    });
    return updated ? this.get(ownerUserId, projectId) : null;
  }

  async linkAccount(
    ownerUserId: string,
    projectId: string,
    input: LinkProjectAccount,
  ): Promise<ProjectAggregateRecord | null> {
    const linked = await this.client.db.transaction(async (transaction) => {
      const project = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${projectId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'project' AND status <> 'deleted'
        FOR UPDATE
      `);
      if (project.length === 0) return false;
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
      if (!account) return false;
      if (input.isPrimary) {
        await transaction
          .update(projectAccounts)
          .set({ isPrimary: false })
          .where(eq(projectAccounts.projectId, projectId));
      }
      await transaction
        .insert(projectAccounts)
        .values({
          projectId,
          accountId: input.accountId,
          ownerUserId,
          isPrimary: input.isPrimary,
        })
        .onConflictDoUpdate({
          target: [projectAccounts.projectId, projectAccounts.accountId],
          set: { isPrimary: input.isPrimary },
        });
      await transaction
        .update(contentObjects)
        .set({ updatedAt: new Date() })
        .where(eq(contentObjects.id, projectId));
      return true;
    });
    return linked ? this.get(ownerUserId, projectId) : null;
  }

  async unlinkAccount(
    ownerUserId: string,
    projectId: string,
    accountId: string,
  ): Promise<ProjectAggregateRecord | null> {
    if (!(await this.getBase(ownerUserId, projectId))) return null;
    await this.client.db
      .delete(projectAccounts)
      .where(
        and(
          eq(projectAccounts.projectId, projectId),
          eq(projectAccounts.accountId, accountId),
          eq(projectAccounts.ownerUserId, ownerUserId),
        ),
      );
    await this.client.db
      .update(contentObjects)
      .set({ updatedAt: new Date() })
      .where(eq(contentObjects.id, projectId));
    return this.get(ownerUserId, projectId);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
