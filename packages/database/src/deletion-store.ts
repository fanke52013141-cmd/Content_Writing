import type { DeletableObjectType, DeletionMode } from '@content-writing/contracts';
import { and, eq, sql } from 'drizzle-orm';

import { createDatabase } from './client.js';
import {
  accountProfileVersions,
  accounts,
  articles,
  articleExports,
  articleReviews,
  articleVersions,
  contentFiles,
  contentObjects,
  contentProjects,
  contentRelations,
  deletionAudits,
  materials,
  outlines,
  projectAccounts,
  topics,
} from './schema.js';

export type DeletionStoreResult =
  | {
      kind: 'ok';
      audit: {
        id: string;
        objectId: string;
        objectType: DeletableObjectType;
        mode: DeletionMode;
        occurredAt: Date;
      };
      storageKeys: readonly string[];
    }
  | { kind: 'not_found' }
  | { kind: 'blocked'; reason: string };

const contentTypes: ReadonlySet<DeletableObjectType> = new Set([
  'project',
  'topic',
  'material',
  'outline',
  'article',
]);

export class DeletionStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  delete(
    ownerUserId: string,
    objectType: DeletableObjectType,
    objectId: string,
    mode: DeletionMode,
  ): Promise<DeletionStoreResult> {
    return this.client.db.transaction(async (transaction) => {
      const object =
        objectType === 'account'
          ? (
              await transaction
                .select({ id: accounts.id, status: accounts.status })
                .from(accounts)
                .where(and(eq(accounts.id, objectId), eq(accounts.ownerUserId, ownerUserId)))
                .limit(1)
            )[0]
          : (
              await transaction
                .select({ id: contentObjects.id, status: contentObjects.status })
                .from(contentObjects)
                .where(
                  and(
                    eq(contentObjects.id, objectId),
                    eq(contentObjects.ownerUserId, ownerUserId),
                    eq(contentObjects.objectType, objectType),
                  ),
                )
                .limit(1)
            )[0];
      if (!object || object.status === 'deleted') return { kind: 'not_found' as const };
      const now = new Date();
      const auditValues = {
        ownerUserId,
        objectId,
        objectType,
        mode,
        occurredAt: now,
      };

      if (mode === 'archive' || mode === 'soft') {
        if (objectType === 'account') {
          await transaction
            .update(accounts)
            .set({
              status: mode === 'archive' ? 'archived' : 'archived',
              archivedAt: now,
              updatedAt: now,
            })
            .where(and(eq(accounts.id, objectId), eq(accounts.ownerUserId, ownerUserId)));
        } else {
          await transaction
            .update(contentObjects)
            .set({
              status: mode === 'archive' ? 'archived' : 'deleted',
              archivedAt: mode === 'archive' ? now : null,
              deletedAt: mode === 'soft' ? now : null,
              updatedAt: now,
            })
            .where(
              and(eq(contentObjects.id, objectId), eq(contentObjects.ownerUserId, ownerUserId)),
            );
        }
        const [audit] = await transaction.insert(deletionAudits).values(auditValues).returning();
        if (!audit) throw new Error('Deletion audit creation failed.');
        return {
          kind: 'ok' as const,
          audit: {
            id: audit.id,
            objectId: audit.objectId,
            objectType,
            mode,
            occurredAt: audit.occurredAt,
          },
          storageKeys: [],
        };
      }

      if (objectType === 'account') {
        const dependent = await transaction.execute<{ blocked: boolean }>(sql`
          SELECT EXISTS (
            SELECT 1 FROM topics WHERE account_id = ${objectId} AND owner_user_id = ${ownerUserId}
          ) OR EXISTS (
            SELECT 1 FROM project_accounts WHERE account_id = ${objectId} AND owner_user_id = ${ownerUserId}
          ) AS blocked
        `);
        if (dependent[0]?.blocked) {
          return {
            kind: 'blocked' as const,
            reason: 'Account is still referenced by projects or topics.',
          };
        }
        await transaction
          .delete(accountProfileVersions)
          .where(eq(accountProfileVersions.accountId, objectId));
        await transaction
          .delete(accounts)
          .where(and(eq(accounts.id, objectId), eq(accounts.ownerUserId, ownerUserId)));
      } else {
        const blocked = await this.hasBlockingReferences(
          transaction,
          objectType,
          objectId,
          ownerUserId,
        );
        if (blocked) return { kind: 'blocked' as const, reason: blocked };
        const keys = (
          await transaction
            .select({ storageKey: contentFiles.storageKey })
            .from(contentFiles)
            .where(
              and(
                eq(contentFiles.ownerUserId, ownerUserId),
                eq(contentFiles.contentObjectId, objectId),
              ),
            )
        ).map((row) => row.storageKey);
        await transaction
          .delete(contentRelations)
          .where(
            and(
              eq(contentRelations.ownerUserId, ownerUserId),
              sql`(${contentRelations.fromObjectId} = ${objectId} OR ${contentRelations.toObjectId} = ${objectId})`,
            ),
          );
        await transaction
          .delete(contentFiles)
          .where(
            and(
              eq(contentFiles.ownerUserId, ownerUserId),
              eq(contentFiles.contentObjectId, objectId),
            ),
          );
        if (objectType === 'article') {
          await transaction
            .update(articles)
            .set({ currentVersionId: null })
            .where(and(eq(articles.id, objectId), eq(articles.ownerUserId, ownerUserId)));
          await transaction
            .delete(articleExports)
            .where(
              and(
                eq(articleExports.articleId, objectId),
                eq(articleExports.ownerUserId, ownerUserId),
              ),
            );
          await transaction
            .delete(articleReviews)
            .where(
              and(
                eq(articleReviews.articleId, objectId),
                eq(articleReviews.ownerUserId, ownerUserId),
              ),
            );
          await transaction
            .delete(articleVersions)
            .where(
              and(
                eq(articleVersions.articleId, objectId),
                eq(articleVersions.ownerUserId, ownerUserId),
              ),
            );
          await transaction
            .delete(articles)
            .where(and(eq(articles.id, objectId), eq(articles.ownerUserId, ownerUserId)));
        } else if (objectType === 'project') {
          await transaction
            .delete(projectAccounts)
            .where(
              and(
                eq(projectAccounts.projectId, objectId),
                eq(projectAccounts.ownerUserId, ownerUserId),
              ),
            );
          await transaction
            .delete(contentProjects)
            .where(
              and(eq(contentProjects.id, objectId), eq(contentProjects.ownerUserId, ownerUserId)),
            );
        } else if (objectType === 'topic') {
          await transaction
            .delete(topics)
            .where(and(eq(topics.id, objectId), eq(topics.ownerUserId, ownerUserId)));
        } else if (objectType === 'material') {
          await transaction
            .delete(materials)
            .where(and(eq(materials.id, objectId), eq(materials.ownerUserId, ownerUserId)));
        } else if (objectType === 'outline') {
          await transaction
            .delete(outlines)
            .where(and(eq(outlines.id, objectId), eq(outlines.ownerUserId, ownerUserId)));
        }
        await transaction
          .delete(contentObjects)
          .where(and(eq(contentObjects.id, objectId), eq(contentObjects.ownerUserId, ownerUserId)));
        const [audit] = await transaction.insert(deletionAudits).values(auditValues).returning();
        if (!audit) throw new Error('Deletion audit creation failed.');
        return {
          kind: 'ok' as const,
          audit: {
            id: audit.id,
            objectId: audit.objectId,
            objectType,
            mode,
            occurredAt: audit.occurredAt,
          },
          storageKeys: keys,
        };
      }
      throw new Error('Unsupported deletion object type.');
    });
  }

  private async hasBlockingReferences(
    transaction: Parameters<
      Parameters<ReturnType<typeof createDatabase>['db']['transaction']>[0]
    >[0],
    objectType: Exclude<DeletableObjectType, 'account'>,
    objectId: string,
    ownerUserId: string,
  ): Promise<string | null> {
    if (!contentTypes.has(objectType)) return 'Object type cannot be deleted.';
    const checks: Record<string, string> = {
      project: `project is referenced by articles, outlines, or topics`,
      topic: `topic is referenced by articles or outlines`,
      outline: `outline is referenced by articles`,
    };
    if (objectType === 'project') {
      const rows = await transaction.execute<{ blocked: boolean }>(sql`
        SELECT EXISTS (SELECT 1 FROM articles WHERE project_id = ${objectId} AND owner_user_id = ${ownerUserId})
          OR EXISTS (SELECT 1 FROM outlines WHERE project_id = ${objectId} AND owner_user_id = ${ownerUserId})
          OR EXISTS (SELECT 1 FROM topics WHERE id IN (SELECT to_object_id FROM content_relations WHERE from_object_id = ${objectId} AND owner_user_id = ${ownerUserId})) AS blocked
      `);
      return rows[0]?.blocked ? (checks.project ?? 'project has dependent content.') : null;
    }
    if (objectType === 'topic') {
      const rows = await transaction.execute<{ blocked: boolean }>(sql`
        SELECT EXISTS (SELECT 1 FROM articles WHERE topic_id = ${objectId} AND owner_user_id = ${ownerUserId})
          OR EXISTS (SELECT 1 FROM outlines WHERE topic_id = ${objectId} AND owner_user_id = ${ownerUserId}) AS blocked
      `);
      return rows[0]?.blocked ? (checks.topic ?? 'topic has dependent content.') : null;
    }
    if (objectType === 'outline') {
      const rows = await transaction.execute<{ blocked: boolean }>(sql`
        SELECT EXISTS (SELECT 1 FROM articles WHERE outline_id = ${objectId} AND owner_user_id = ${ownerUserId}) AS blocked
      `);
      return rows[0]?.blocked ? (checks.outline ?? 'outline has dependent content.') : null;
    }
    return null;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

export class InMemoryDeletionRepository {
  delete(
    _ownerUserId: string,
    objectType: DeletableObjectType,
    objectId: string,
    mode: DeletionMode,
  ): Promise<DeletionStoreResult> {
    const now = new Date();
    return Promise.resolve({
      kind: 'ok',
      audit: {
        id: crypto.randomUUID(),
        objectId,
        objectType,
        mode,
        occurredAt: now,
      },
      storageKeys: [],
    });
  }
}
