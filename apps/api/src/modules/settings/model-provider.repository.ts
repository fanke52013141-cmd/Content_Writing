import type {
  CreateModelProviderConfig,
  ModelProviderConfig,
  UpdateModelProviderConfig,
} from '@content-writing/contracts';
import { ModelProviderStore, type ModelProviderConfigRecord } from '@content-writing/database';

export interface ModelProviderRepository {
  list(ownerUserId: string): Promise<readonly ModelProviderConfig[]>;
  create(
    ownerUserId: string,
    input: CreateModelProviderConfig,
    apiKeyCiphertext: string | null,
  ): Promise<ModelProviderConfig>;
  update(
    ownerUserId: string,
    id: string,
    input: UpdateModelProviderConfig,
    apiKeyCiphertext?: string | null,
  ): Promise<ModelProviderConfig | null>;
  close?(): Promise<void>;
}

export const MODEL_PROVIDER_REPOSITORY = Symbol('MODEL_PROVIDER_REPOSITORY');

function mapRecord(record: ModelProviderConfigRecord): ModelProviderConfig {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    baseUrl: record.baseUrl,
    model: record.model,
    enabled: record.enabled,
    apiKeySet: record.apiKeyCiphertext !== null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class PostgresModelProviderRepository implements ModelProviderRepository {
  private readonly store: ModelProviderStore;
  constructor(databaseUrl: string) {
    this.store = new ModelProviderStore(databaseUrl);
  }
  async list(ownerUserId: string): Promise<readonly ModelProviderConfig[]> {
    return (await this.store.list(ownerUserId)).map(mapRecord);
  }
  async create(
    ownerUserId: string,
    input: CreateModelProviderConfig,
    apiKeyCiphertext: string | null,
  ): Promise<ModelProviderConfig> {
    return mapRecord(await this.store.create(ownerUserId, { ...input, apiKeyCiphertext }));
  }
  async update(
    ownerUserId: string,
    id: string,
    input: UpdateModelProviderConfig,
    apiKeyCiphertext?: string | null,
  ): Promise<ModelProviderConfig | null> {
    const values = { ...input, ...(apiKeyCiphertext !== undefined ? { apiKeyCiphertext } : {}) };
    const record = await this.store.update(ownerUserId, id, values);
    return record ? mapRecord(record) : null;
  }
  close(): Promise<void> {
    return this.store.close();
  }
}

export class InMemoryModelProviderRepository implements ModelProviderRepository {
  private records = new Map<string, ModelProviderConfig & { apiKeyCiphertext: string | null }>();
  list(ownerUserId: string): Promise<readonly ModelProviderConfig[]> {
    void ownerUserId;
    return Promise.resolve(
      [...this.records.values()].map(({ apiKeyCiphertext, ...record }) =>
        structuredClone({ ...record, apiKeySet: apiKeyCiphertext !== null }),
      ),
    );
  }
  create(
    ownerUserId: string,
    input: CreateModelProviderConfig,
    apiKeyCiphertext: string | null,
  ): Promise<ModelProviderConfig> {
    void ownerUserId;
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      model: input.model,
      enabled: input.enabled,
      apiKeySet: apiKeyCiphertext !== null,
      apiKeyCiphertext,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    const { apiKeyCiphertext: storedKey, ...publicRecord } = record;
    return Promise.resolve(structuredClone({ ...publicRecord, apiKeySet: storedKey !== null }));
  }
  update(
    ownerUserId: string,
    id: string,
    input: UpdateModelProviderConfig,
    apiKeyCiphertext?: string | null,
  ): Promise<ModelProviderConfig | null> {
    void ownerUserId;
    const current = this.records.get(id);
    if (!current) return Promise.resolve(null);
    const next = {
      ...current,
      ...input,
      ...(apiKeyCiphertext !== undefined
        ? { apiKeyCiphertext, apiKeySet: apiKeyCiphertext !== null }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, next);
    const { apiKeyCiphertext: storedKey, ...publicRecord } = next;
    return Promise.resolve(structuredClone({ ...publicRecord, apiKeySet: storedKey !== null }));
  }
}
