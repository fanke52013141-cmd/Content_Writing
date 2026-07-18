import type { MaterialKind, TermsReviewStatus, UpdateMaterial } from '@content-writing/contracts';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { createDatabase } from './client.js';
import {
  contentFiles,
  contentObjects,
  contentProjects,
  contentRelations,
  materials,
  topics,
  type ContentFileRecord,
  type ContentObjectRecord,
  type MaterialRecord,
} from './schema.js';

export interface NewStoredFile {
  fileRole: 'original' | 'raw_snapshot';
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  expiresAt: Date | null;
}

export interface CreateMaterialRecord {
  id: string;
  title: string;
  kind: MaterialKind;
  sourceText: string | null;
  extractedText: string;
  notes: string;
  sourceUrl: string | null;
  sourceTitle: string;
  sourceSiteName: string;
  fetchedAt: Date | null;
  termsReviewStatus: TermsReviewStatus;
  extractionWarnings: readonly string[];
  files: readonly NewStoredFile[];
}

export interface MaterialProjectAggregateRecord {
  projectId: string;
  projectTitle: string;
}

export interface MaterialTopicAggregateRecord {
  topicId: string;
  topicTitle: string;
}

export interface MaterialAggregateRecord {
  object: ContentObjectRecord;
  material: MaterialRecord;
  files: readonly ContentFileRecord[];
  projectLinks: readonly MaterialProjectAggregateRecord[];
  topicLinks: readonly MaterialTopicAggregateRecord[];
}

export type MaterialMutationResult =
  | { kind: 'ok'; material: MaterialAggregateRecord }
  | { kind: 'not_found' }
  | { kind: 'invalid_context' };

interface MaterialBaseRecord {
  object: ContentObjectRecord;
  material: MaterialRecord;
}

export class MaterialStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  private async getBase(
    ownerUserId: string,
    materialId: string,
  ): Promise<MaterialBaseRecord | null> {
    const [row] = await this.client.db
      .select({ object: contentObjects, material: materials })
      .from(materials)
      .innerJoin(contentObjects, eq(contentObjects.id, materials.id))
      .where(
        and(
          eq(materials.id, materialId),
          eq(contentObjects.ownerUserId, ownerUserId),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async enrich(
    rows: readonly MaterialBaseRecord[],
  ): Promise<readonly MaterialAggregateRecord[]> {
    if (rows.length === 0) return [];
    const materialIds = rows.map((row) => row.material.id);
    const [fileRows, projectRows, topicRows] = await Promise.all([
      this.client.db
        .select()
        .from(contentFiles)
        .where(
          and(inArray(contentFiles.contentObjectId, materialIds), isNull(contentFiles.deletedAt)),
        ),
      this.client.db
        .select({
          materialId: contentRelations.toObjectId,
          projectId: contentProjects.id,
          projectTitle: contentProjects.title,
        })
        .from(contentRelations)
        .innerJoin(contentProjects, eq(contentProjects.id, contentRelations.fromObjectId))
        .where(
          and(
            inArray(contentRelations.toObjectId, materialIds),
            eq(contentRelations.relationType, 'project_has_material'),
            isNull(contentRelations.endedAt),
          ),
        ),
      this.client.db
        .select({
          materialId: contentRelations.toObjectId,
          topicId: topics.id,
          topicTitle: topics.title,
        })
        .from(contentRelations)
        .innerJoin(topics, eq(topics.id, contentRelations.fromObjectId))
        .where(
          and(
            inArray(contentRelations.toObjectId, materialIds),
            eq(contentRelations.relationType, 'topic_has_material'),
            isNull(contentRelations.endedAt),
          ),
        ),
    ]);
    return rows.map((row) => ({
      ...row,
      files: fileRows.filter((file) => file.contentObjectId === row.material.id),
      projectLinks: projectRows
        .filter((link) => link.materialId === row.material.id)
        .map(({ projectId, projectTitle }) => ({ projectId, projectTitle })),
      topicLinks: topicRows
        .filter((link) => link.materialId === row.material.id)
        .map(({ topicId, topicTitle }) => ({ topicId, topicTitle })),
    }));
  }

  async create(ownerUserId: string, input: CreateMaterialRecord): Promise<MaterialAggregateRecord> {
    await this.client.db.transaction(async (transaction) => {
      await transaction.insert(contentObjects).values({
        id: input.id,
        ownerUserId,
        objectType: 'material',
      });
      await transaction.insert(materials).values({
        id: input.id,
        ownerUserId,
        title: input.title,
        kind: input.kind,
        sourceText: input.sourceText,
        extractedText: input.extractedText,
        notes: input.notes,
        sourceUrl: input.sourceUrl,
        sourceTitle: input.sourceTitle,
        sourceSiteName: input.sourceSiteName,
        fetchedAt: input.fetchedAt,
        termsReviewStatus: input.termsReviewStatus,
        extractionWarnings: [...input.extractionWarnings],
      });
      if (input.files.length > 0) {
        await transaction.insert(contentFiles).values(
          input.files.map((file) => ({
            ...file,
            ownerUserId,
            contentObjectId: input.id,
          })),
        );
      }
    });
    const material = await this.get(ownerUserId, input.id);
    if (!material) throw new Error('Material creation failed.');
    return material;
  }

  async list(ownerUserId: string): Promise<readonly MaterialAggregateRecord[]> {
    const rows = await this.client.db
      .select({ object: contentObjects, material: materials })
      .from(materials)
      .innerJoin(contentObjects, eq(contentObjects.id, materials.id))
      .where(
        and(
          eq(contentObjects.ownerUserId, ownerUserId),
          eq(contentObjects.objectType, 'material'),
          ne(contentObjects.status, 'deleted'),
        ),
      )
      .orderBy(desc(contentObjects.updatedAt));
    return this.enrich(rows);
  }

  async get(ownerUserId: string, materialId: string): Promise<MaterialAggregateRecord | null> {
    const row = await this.getBase(ownerUserId, materialId);
    if (!row) return null;
    return (await this.enrich([row]))[0] ?? null;
  }

  async update(
    ownerUserId: string,
    materialId: string,
    input: UpdateMaterial,
  ): Promise<MaterialMutationResult> {
    const result = await this.client.db.transaction(async (transaction) => {
      const locked = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${materialId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'material' AND status <> 'deleted'
        FOR UPDATE
      `);
      if (locked.length === 0) return 'not_found' as const;
      if (input.termsReviewStatus) {
        const [material] = await transaction
          .select({ kind: materials.kind })
          .from(materials)
          .where(eq(materials.id, materialId))
          .limit(1);
        if (material?.kind !== 'webpage') return 'invalid_context' as const;
      }
      await transaction
        .update(materials)
        .set({
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          ...(input.termsReviewStatus === undefined
            ? {}
            : { termsReviewStatus: input.termsReviewStatus }),
        })
        .where(eq(materials.id, materialId));
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
        .where(eq(contentObjects.id, materialId));
      return 'ok' as const;
    });
    if (result !== 'ok') return { kind: result };
    const material = await this.get(ownerUserId, materialId);
    return material ? { kind: 'ok', material } : { kind: 'not_found' };
  }

  private async link(
    ownerUserId: string,
    materialId: string,
    contextId: string,
    contextType: 'project' | 'topic',
  ): Promise<MaterialMutationResult> {
    const relationType =
      contextType === 'project'
        ? ('project_has_material' as const)
        : ('topic_has_material' as const);
    const linked = await this.client.db.transaction(async (transaction) => {
      const context = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${contextId} AND owner_user_id = ${ownerUserId}
          AND object_type = ${contextType} AND status IN ('active', 'completed')
        FOR UPDATE
      `);
      const material = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM content_objects
        WHERE id = ${materialId} AND owner_user_id = ${ownerUserId}
          AND object_type = 'material' AND status = 'active'
      `);
      if (context.length === 0 || material.length === 0) return false;
      const [existing] = await transaction
        .select({ id: contentRelations.id })
        .from(contentRelations)
        .where(
          and(
            eq(contentRelations.fromObjectId, contextId),
            eq(contentRelations.toObjectId, materialId),
            eq(contentRelations.relationType, relationType),
            isNull(contentRelations.endedAt),
          ),
        )
        .limit(1);
      if (!existing) {
        await transaction.insert(contentRelations).values({
          ownerUserId,
          fromObjectId: contextId,
          toObjectId: materialId,
          relationType,
          projectScopeId: contextType === 'project' ? contextId : null,
        });
      }
      await transaction
        .update(contentObjects)
        .set({ updatedAt: new Date() })
        .where(inArray(contentObjects.id, [materialId, contextId]));
      return true;
    });
    if (!linked) return { kind: 'invalid_context' };
    const material = await this.get(ownerUserId, materialId);
    return material ? { kind: 'ok', material } : { kind: 'not_found' };
  }

  linkProject(
    ownerUserId: string,
    materialId: string,
    projectId: string,
  ): Promise<MaterialMutationResult> {
    return this.link(ownerUserId, materialId, projectId, 'project');
  }

  linkTopic(
    ownerUserId: string,
    materialId: string,
    topicId: string,
  ): Promise<MaterialMutationResult> {
    return this.link(ownerUserId, materialId, topicId, 'topic');
  }

  private async unlink(
    ownerUserId: string,
    materialId: string,
    contextId: string,
    relationType: 'project_has_material' | 'topic_has_material',
  ): Promise<MaterialMutationResult> {
    if (!(await this.getBase(ownerUserId, materialId))) return { kind: 'not_found' };
    await this.client.db
      .update(contentRelations)
      .set({ endedAt: new Date(), isPrimary: false })
      .where(
        and(
          eq(contentRelations.ownerUserId, ownerUserId),
          eq(contentRelations.fromObjectId, contextId),
          eq(contentRelations.toObjectId, materialId),
          eq(contentRelations.relationType, relationType),
          isNull(contentRelations.endedAt),
        ),
      );
    const material = await this.get(ownerUserId, materialId);
    return material ? { kind: 'ok', material } : { kind: 'not_found' };
  }

  unlinkProject(
    ownerUserId: string,
    materialId: string,
    projectId: string,
  ): Promise<MaterialMutationResult> {
    return this.unlink(ownerUserId, materialId, projectId, 'project_has_material');
  }

  unlinkTopic(
    ownerUserId: string,
    materialId: string,
    topicId: string,
  ): Promise<MaterialMutationResult> {
    return this.unlink(ownerUserId, materialId, topicId, 'topic_has_material');
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
