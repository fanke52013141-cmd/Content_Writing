import type { Material, UpdateMaterial } from '@content-writing/contracts';
import {
  MaterialStore,
  type CreateMaterialRecord,
  type MaterialAggregateRecord,
} from '@content-writing/database';

export type MaterialRepositoryMutation =
  { kind: 'ok'; material: Material } | { kind: 'not_found' } | { kind: 'invalid_context' };

export interface MaterialRepository {
  create(ownerUserId: string, input: CreateMaterialRecord): Promise<Material>;
  list(ownerUserId: string): Promise<readonly Material[]>;
  get(ownerUserId: string, materialId: string): Promise<Material | null>;
  update(
    ownerUserId: string,
    materialId: string,
    input: UpdateMaterial,
  ): Promise<MaterialRepositoryMutation>;
  linkProject(
    ownerUserId: string,
    materialId: string,
    projectId: string,
  ): Promise<MaterialRepositoryMutation>;
  unlinkProject(
    ownerUserId: string,
    materialId: string,
    projectId: string,
  ): Promise<MaterialRepositoryMutation>;
  linkTopic(
    ownerUserId: string,
    materialId: string,
    topicId: string,
  ): Promise<MaterialRepositoryMutation>;
  unlinkTopic(
    ownerUserId: string,
    materialId: string,
    topicId: string,
  ): Promise<MaterialRepositoryMutation>;
  close?(): Promise<void>;
}

export const MATERIAL_REPOSITORY = Symbol('MATERIAL_REPOSITORY');

function materialFromAggregate(record: MaterialAggregateRecord): Material {
  if (record.object.status !== 'active' && record.object.status !== 'archived') {
    throw new Error('Material has an invalid public lifecycle status.');
  }
  const original = record.files.find((file) => file.fileRole === 'original');
  const snapshot = record.files.find((file) => file.fileRole === 'raw_snapshot');
  return {
    id: record.material.id,
    title: record.material.title,
    kind: record.material.kind,
    extractedText: record.material.extractedText,
    notes: record.material.notes,
    sourceUrl: record.material.sourceUrl,
    sourceTitle: record.material.sourceTitle,
    sourceSiteName: record.material.sourceSiteName,
    fetchedAt: record.material.fetchedAt?.toISOString() ?? null,
    termsReviewStatus: record.material.termsReviewStatus,
    originalFilename: original?.originalFilename ?? '',
    mimeType: original?.mimeType ?? '',
    byteSize: original?.byteSize ?? null,
    sha256: original?.sha256 ?? null,
    fileAvailable: original !== undefined,
    rawSnapshotExpiresAt: snapshot?.expiresAt?.toISOString() ?? null,
    extractionWarnings: [...record.material.extractionWarnings],
    status: record.object.status,
    projectLinks: [...record.projectLinks],
    topicLinks: [...record.topicLinks],
    createdAt: record.object.createdAt.toISOString(),
    updatedAt: record.object.updatedAt.toISOString(),
    archivedAt: record.object.archivedAt?.toISOString() ?? null,
  };
}

export class PostgresMaterialRepository implements MaterialRepository {
  private readonly store: MaterialStore;

  constructor(databaseUrl: string) {
    this.store = new MaterialStore(databaseUrl);
  }

  async create(ownerUserId: string, input: CreateMaterialRecord): Promise<Material> {
    return materialFromAggregate(await this.store.create(ownerUserId, input));
  }

  async list(ownerUserId: string): Promise<readonly Material[]> {
    return (await this.store.list(ownerUserId)).map(materialFromAggregate);
  }

  async get(ownerUserId: string, materialId: string): Promise<Material | null> {
    const material = await this.store.get(ownerUserId, materialId);
    return material ? materialFromAggregate(material) : null;
  }

  private mapMutation(
    result: Awaited<ReturnType<MaterialStore['update']>>,
  ): MaterialRepositoryMutation {
    return result.kind === 'ok'
      ? { kind: 'ok', material: materialFromAggregate(result.material) }
      : result;
  }

  async update(
    ownerUserId: string,
    materialId: string,
    input: UpdateMaterial,
  ): Promise<MaterialRepositoryMutation> {
    return this.mapMutation(await this.store.update(ownerUserId, materialId, input));
  }

  async linkProject(
    ownerUserId: string,
    materialId: string,
    projectId: string,
  ): Promise<MaterialRepositoryMutation> {
    return this.mapMutation(await this.store.linkProject(ownerUserId, materialId, projectId));
  }

  async unlinkProject(
    ownerUserId: string,
    materialId: string,
    projectId: string,
  ): Promise<MaterialRepositoryMutation> {
    return this.mapMutation(await this.store.unlinkProject(ownerUserId, materialId, projectId));
  }

  async linkTopic(
    ownerUserId: string,
    materialId: string,
    topicId: string,
  ): Promise<MaterialRepositoryMutation> {
    return this.mapMutation(await this.store.linkTopic(ownerUserId, materialId, topicId));
  }

  async unlinkTopic(
    ownerUserId: string,
    materialId: string,
    topicId: string,
  ): Promise<MaterialRepositoryMutation> {
    return this.mapMutation(await this.store.unlinkTopic(ownerUserId, materialId, topicId));
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

interface OwnedMaterial extends Material {
  ownerUserId: string;
}

export class InMemoryMaterialRepository implements MaterialRepository {
  private readonly materials = new Map<string, OwnedMaterial>();

  constructor(
    private readonly projectTitles = new Map<string, string>(),
    private readonly topicTitles = new Map<string, string>(),
  ) {}

  create(ownerUserId: string, input: CreateMaterialRecord): Promise<Material> {
    const now = new Date().toISOString();
    const original = input.files.find((file) => file.fileRole === 'original');
    const snapshot = input.files.find((file) => file.fileRole === 'raw_snapshot');
    const material: OwnedMaterial = {
      id: input.id,
      ownerUserId,
      title: input.title,
      kind: input.kind,
      extractedText: input.extractedText,
      notes: input.notes,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      sourceSiteName: input.sourceSiteName,
      fetchedAt: input.fetchedAt?.toISOString() ?? null,
      termsReviewStatus: input.termsReviewStatus,
      originalFilename: original?.originalFilename ?? '',
      mimeType: original?.mimeType ?? '',
      byteSize: original?.byteSize ?? null,
      sha256: original?.sha256 ?? null,
      fileAvailable: original !== undefined,
      rawSnapshotExpiresAt: snapshot?.expiresAt?.toISOString() ?? null,
      extractionWarnings: [...input.extractionWarnings],
      status: 'active',
      projectLinks: [],
      topicLinks: [],
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.materials.set(material.id, material);
    return Promise.resolve(material);
  }

  list(ownerUserId: string): Promise<readonly Material[]> {
    return Promise.resolve(
      [...this.materials.values()].filter((material) => material.ownerUserId === ownerUserId),
    );
  }

  get(ownerUserId: string, materialId: string): Promise<Material | null> {
    const material = this.materials.get(materialId);
    return Promise.resolve(material?.ownerUserId === ownerUserId ? material : null);
  }

  update(
    ownerUserId: string,
    materialId: string,
    input: UpdateMaterial,
  ): Promise<MaterialRepositoryMutation> {
    const material = this.materials.get(materialId);
    if (!material || material.ownerUserId !== ownerUserId)
      return Promise.resolve({ kind: 'not_found' });
    if (input.termsReviewStatus && material.kind !== 'webpage') {
      return Promise.resolve({ kind: 'invalid_context' });
    }
    const now = new Date().toISOString();
    const updated: OwnedMaterial = {
      ...material,
      ...input,
      updatedAt: now,
      archivedAt:
        input.status === 'archived' ? now : input.status === undefined ? material.archivedAt : null,
    };
    this.materials.set(materialId, updated);
    return Promise.resolve({ kind: 'ok', material: updated });
  }

  private link(
    ownerUserId: string,
    materialId: string,
    contextId: string,
    contextType: 'project' | 'topic',
  ): Promise<MaterialRepositoryMutation> {
    const material = this.materials.get(materialId);
    const names = contextType === 'project' ? this.projectTitles : this.topicTitles;
    if (
      !material ||
      material.ownerUserId !== ownerUserId ||
      material.status !== 'active' ||
      !names.has(contextId)
    ) {
      return Promise.resolve({ kind: 'invalid_context' });
    }
    const updated: OwnedMaterial = {
      ...material,
      projectLinks:
        contextType === 'project'
          ? [
              ...material.projectLinks.filter((link) => link.projectId !== contextId),
              { projectId: contextId, projectTitle: names.get(contextId) ?? 'Content project' },
            ]
          : material.projectLinks,
      topicLinks:
        contextType === 'topic'
          ? [
              ...material.topicLinks.filter((link) => link.topicId !== contextId),
              { topicId: contextId, topicTitle: names.get(contextId) ?? 'Topic' },
            ]
          : material.topicLinks,
      updatedAt: new Date().toISOString(),
    };
    this.materials.set(materialId, updated);
    return Promise.resolve({ kind: 'ok', material: updated });
  }

  linkProject(
    ownerUserId: string,
    materialId: string,
    projectId: string,
  ): Promise<MaterialRepositoryMutation> {
    return this.link(ownerUserId, materialId, projectId, 'project');
  }

  linkTopic(
    ownerUserId: string,
    materialId: string,
    topicId: string,
  ): Promise<MaterialRepositoryMutation> {
    return this.link(ownerUserId, materialId, topicId, 'topic');
  }

  private unlink(
    ownerUserId: string,
    materialId: string,
    contextId: string,
    contextType: 'project' | 'topic',
  ): Promise<MaterialRepositoryMutation> {
    const material = this.materials.get(materialId);
    if (!material || material.ownerUserId !== ownerUserId)
      return Promise.resolve({ kind: 'not_found' });
    const updated: OwnedMaterial = {
      ...material,
      projectLinks:
        contextType === 'project'
          ? material.projectLinks.filter((link) => link.projectId !== contextId)
          : material.projectLinks,
      topicLinks:
        contextType === 'topic'
          ? material.topicLinks.filter((link) => link.topicId !== contextId)
          : material.topicLinks,
      updatedAt: new Date().toISOString(),
    };
    this.materials.set(materialId, updated);
    return Promise.resolve({ kind: 'ok', material: updated });
  }

  unlinkProject(
    ownerUserId: string,
    materialId: string,
    projectId: string,
  ): Promise<MaterialRepositoryMutation> {
    return this.unlink(ownerUserId, materialId, projectId, 'project');
  }

  unlinkTopic(
    ownerUserId: string,
    materialId: string,
    topicId: string,
  ): Promise<MaterialRepositoryMutation> {
    return this.unlink(ownerUserId, materialId, topicId, 'topic');
  }
}
