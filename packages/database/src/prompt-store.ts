import type { CreatePrompt, CreatePromptVersion } from '@content-writing/contracts';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { createDatabase } from './client.js';
import { aiCapabilities, promptVersions, prompts, type PromptVersionRecord } from './schema.js';

export interface PromptAggregateRecord {
  prompt: typeof prompts.$inferSelect;
  versions: readonly PromptVersionRecord[];
}

export class PromptStore {
  private readonly client: ReturnType<typeof createDatabase>;
  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  async list(ownerUserId: string): Promise<readonly PromptAggregateRecord[]> {
    const promptRows = await this.client.db
      .select()
      .from(prompts)
      .where(and(eq(prompts.ownerUserId, ownerUserId), isNull(prompts.archivedAt)))
      .orderBy(prompts.capabilityKey, prompts.createdAt);
    const versions =
      promptRows.length === 0
        ? []
        : await this.client.db
            .select()
            .from(promptVersions)
            .where(
              inArray(
                promptVersions.promptId,
                promptRows.map((row) => row.id),
              ),
            )
            .orderBy(asc(promptVersions.versionNumber));
    return promptRows.map((prompt) => ({
      prompt,
      versions: versions.filter((version) => version.promptId === prompt.id),
    }));
  }

  async create(ownerUserId: string, input: CreatePrompt): Promise<PromptAggregateRecord | null> {
    return this.client.db.transaction(async (tx) => {
      const [capability] = await tx
        .select({ key: aiCapabilities.key })
        .from(aiCapabilities)
        .where(eq(aiCapabilities.key, input.capabilityKey))
        .limit(1);
      if (!capability) return null;
      const [prompt] = await tx
        .insert(prompts)
        .values({
          ownerUserId,
          capabilityKey: input.capabilityKey,
          name: input.name,
          safetyBoundary: input.safetyBoundary,
        })
        .returning();
      if (!prompt) throw new Error('Prompt creation failed.');
      const [version] = await tx
        .insert(promptVersions)
        .values({ promptId: prompt.id, versionNumber: 1, body: input.body })
        .returning();
      if (!version) throw new Error('Prompt version creation failed.');
      return { prompt, versions: [version] };
    });
  }

  async createVersion(
    ownerUserId: string,
    promptId: string,
    input: CreatePromptVersion,
  ): Promise<PromptAggregateRecord | null> {
    return this.client.db.transaction(async (tx) => {
      const [prompt] = await tx
        .select()
        .from(prompts)
        .where(
          and(
            eq(prompts.id, promptId),
            eq(prompts.ownerUserId, ownerUserId),
            isNull(prompts.archivedAt),
          ),
        )
        .limit(1);
      if (!prompt) return null;
      const [last] = await tx
        .select({ versionNumber: promptVersions.versionNumber })
        .from(promptVersions)
        .where(eq(promptVersions.promptId, promptId))
        .orderBy(desc(promptVersions.versionNumber))
        .limit(1);
      const [version] = await tx
        .insert(promptVersions)
        .values({ promptId, versionNumber: (last?.versionNumber ?? 0) + 1, body: input.body })
        .returning();
      if (!version) throw new Error('Prompt version creation failed.');
      const versions = await tx
        .select()
        .from(promptVersions)
        .where(eq(promptVersions.promptId, promptId))
        .orderBy(asc(promptVersions.versionNumber));
      return { prompt, versions };
    });
  }

  async activate(
    ownerUserId: string,
    promptId: string,
    versionId: string,
    isDefault: boolean,
  ): Promise<PromptAggregateRecord | null> {
    return this.client.db.transaction(async (tx) => {
      const [prompt] = await tx
        .select()
        .from(prompts)
        .where(
          and(
            eq(prompts.id, promptId),
            eq(prompts.ownerUserId, ownerUserId),
            isNull(prompts.archivedAt),
          ),
        )
        .limit(1);
      const [version] = await tx
        .select()
        .from(promptVersions)
        .where(and(eq(promptVersions.id, versionId), eq(promptVersions.promptId, promptId)))
        .limit(1);
      if (!prompt || !version) return null;
      if (isDefault)
        await tx
          .update(promptVersions)
          .set({ isDefault: false })
          .where(eq(promptVersions.promptId, promptId));
      await tx
        .update(promptVersions)
        .set({ status: 'active', isDefault, activatedAt: new Date() })
        .where(eq(promptVersions.id, versionId));
      const versions = await tx
        .select()
        .from(promptVersions)
        .where(eq(promptVersions.promptId, promptId))
        .orderBy(asc(promptVersions.versionNumber));
      return { prompt: { ...prompt, updatedAt: new Date() }, versions };
    });
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
