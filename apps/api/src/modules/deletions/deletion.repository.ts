import type { DeletableObjectType, DeletionAudit, DeletionMode } from '@content-writing/contracts';
import {
  DeletionStore,
  InMemoryDeletionRepository as DatabaseInMemoryDeletionRepository,
  type DeletionStoreResult,
} from '@content-writing/database';

export type DeletionMutation =
  | { kind: 'ok'; audit: DeletionAudit; storageKeys: readonly string[] }
  | { kind: 'not_found' }
  | { kind: 'blocked'; reason: string };

export interface DeletionRepository {
  delete(
    ownerUserId: string,
    objectType: DeletableObjectType,
    objectId: string,
    mode: DeletionMode,
  ): Promise<DeletionMutation>;
  close?(): Promise<void>;
}

export const DELETION_REPOSITORY = Symbol('DELETION_REPOSITORY');

function mapResult(result: DeletionStoreResult): DeletionMutation {
  if (result.kind !== 'ok') return result;
  return {
    kind: 'ok',
    storageKeys: result.storageKeys,
    audit: {
      id: result.audit.id,
      objectId: result.audit.objectId,
      objectType: result.audit.objectType,
      mode: result.audit.mode,
      occurredAt: result.audit.occurredAt.toISOString(),
    },
  };
}

export class PostgresDeletionRepository implements DeletionRepository {
  private readonly store: DeletionStore;

  constructor(databaseUrl: string) {
    this.store = new DeletionStore(databaseUrl);
  }

  async delete(
    ownerUserId: string,
    objectType: DeletableObjectType,
    objectId: string,
    mode: DeletionMode,
  ): Promise<DeletionMutation> {
    return mapResult(await this.store.delete(ownerUserId, objectType, objectId, mode));
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

export class InMemoryDeletionRepository implements DeletionRepository {
  private readonly store = new DatabaseInMemoryDeletionRepository();

  async delete(
    ownerUserId: string,
    objectType: DeletableObjectType,
    objectId: string,
    mode: DeletionMode,
  ): Promise<DeletionMutation> {
    return mapResult(await this.store.delete(ownerUserId, objectType, objectId, mode));
  }
}
