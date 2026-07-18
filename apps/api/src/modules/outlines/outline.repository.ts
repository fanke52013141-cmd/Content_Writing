import {
  outlineSectionSchema,
  type CreateOutline,
  type Outline,
  type UpdateOutline,
} from '@content-writing/contracts';
import {
  InMemoryOutlineRepository as DatabaseInMemoryOutlineRepository,
  OutlineStore,
  type OutlineAggregateRecord,
} from '@content-writing/database';

export type OutlineRepositoryMutation =
  { kind: 'ok'; outline: Outline } | { kind: 'not_found' } | { kind: 'invalid_context' };

export interface OutlineRepository {
  create(ownerUserId: string, input: CreateOutline): Promise<Outline | null>;
  list(ownerUserId: string): Promise<readonly Outline[]>;
  get(ownerUserId: string, outlineId: string): Promise<Outline | null>;
  update(
    ownerUserId: string,
    outlineId: string,
    input: UpdateOutline,
  ): Promise<OutlineRepositoryMutation>;
  close?(): Promise<void>;
}

export const OUTLINE_REPOSITORY = Symbol('OUTLINE_REPOSITORY');

function outlineFromAggregate(record: OutlineAggregateRecord): Outline {
  if (record.object.status !== 'active' && record.object.status !== 'archived') {
    throw new Error('Outline has an invalid public lifecycle status.');
  }
  return {
    id: record.outline.id,
    projectId: record.outline.projectId,
    topicId: record.outline.topicId,
    title: record.outline.title,
    summary: record.outline.summary,
    sections: outlineSectionSchema.array().parse(record.outline.sections),
    source: record.outline.source,
    sourceGenerationId: record.outline.sourceGenerationId,
    status: record.object.status,
    createdAt: record.outline.createdAt.toISOString(),
    updatedAt: record.outline.updatedAt.toISOString(),
    archivedAt: record.object.archivedAt?.toISOString() ?? null,
  };
}

export class PostgresOutlineRepository implements OutlineRepository {
  private readonly store: OutlineStore;

  constructor(databaseUrl: string) {
    this.store = new OutlineStore(databaseUrl);
  }

  async create(ownerUserId: string, input: CreateOutline): Promise<Outline | null> {
    const result = await this.store.create(ownerUserId, input);
    return result ? outlineFromAggregate(result) : null;
  }

  async list(ownerUserId: string): Promise<readonly Outline[]> {
    return (await this.store.list(ownerUserId)).map(outlineFromAggregate);
  }

  async get(ownerUserId: string, outlineId: string): Promise<Outline | null> {
    const result = await this.store.get(ownerUserId, outlineId);
    return result ? outlineFromAggregate(result) : null;
  }

  async update(
    ownerUserId: string,
    outlineId: string,
    input: UpdateOutline,
  ): Promise<OutlineRepositoryMutation> {
    const result = await this.store.update(ownerUserId, outlineId, input);
    return result.kind === 'ok'
      ? { kind: 'ok', outline: outlineFromAggregate(result.outline) }
      : result;
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

export class InMemoryOutlineRepository implements OutlineRepository {
  private readonly store: DatabaseInMemoryOutlineRepository;

  constructor(projectIds = new Set<string>(), topicIds = new Set<string>()) {
    this.store = new DatabaseInMemoryOutlineRepository(projectIds, topicIds);
  }

  async create(ownerUserId: string, input: CreateOutline): Promise<Outline | null> {
    const result = await this.store.create(ownerUserId, input);
    return result ? outlineFromAggregate(result) : null;
  }

  async list(ownerUserId: string): Promise<readonly Outline[]> {
    return (await this.store.list(ownerUserId)).map(outlineFromAggregate);
  }

  async get(ownerUserId: string, outlineId: string): Promise<Outline | null> {
    const result = await this.store.get(ownerUserId, outlineId);
    return result ? outlineFromAggregate(result) : null;
  }

  async update(
    ownerUserId: string,
    outlineId: string,
    input: UpdateOutline,
  ): Promise<OutlineRepositoryMutation> {
    const result = await this.store.update(ownerUserId, outlineId, input);
    return result.kind === 'ok'
      ? { kind: 'ok', outline: outlineFromAggregate(result.outline) }
      : result;
  }
}
