import type { ModelProviderKind } from '@content-writing/contracts';
import { and, desc, eq } from 'drizzle-orm';

import { createDatabase } from './client.js';
import { modelProviderConfigs, type ModelProviderConfigRecord } from './schema.js';

export class ModelProviderStore {
  private readonly client: ReturnType<typeof createDatabase>;
  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }
  list(ownerUserId: string): Promise<readonly ModelProviderConfigRecord[]> {
    return this.client.db
      .select()
      .from(modelProviderConfigs)
      .where(eq(modelProviderConfigs.ownerUserId, ownerUserId))
      .orderBy(desc(modelProviderConfigs.updatedAt));
  }
  async create(
    ownerUserId: string,
    input: {
      name: string;
      kind: ModelProviderKind;
      baseUrl: string;
      model: string;
      apiKeyCiphertext: string | null;
      enabled: boolean;
    },
  ): Promise<ModelProviderConfigRecord> {
    const [record] = await this.client.db
      .insert(modelProviderConfigs)
      .values({ ownerUserId, ...input })
      .returning();
    if (!record) throw new Error('Model provider creation failed.');
    return record;
  }
  async update(
    ownerUserId: string,
    id: string,
    input: Partial<{
      name: string;
      kind: ModelProviderKind;
      baseUrl: string;
      model: string;
      apiKeyCiphertext: string | null;
      enabled: boolean;
    }>,
  ): Promise<ModelProviderConfigRecord | null> {
    const [record] = await this.client.db
      .update(modelProviderConfigs)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(eq(modelProviderConfigs.ownerUserId, ownerUserId), eq(modelProviderConfigs.id, id)),
      )
      .returning();
    return record ?? null;
  }
  close(): Promise<void> {
    return this.client.close();
  }
}
