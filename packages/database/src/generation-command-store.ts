import type { CreateGeneration, GenerationJob } from '@content-writing/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { createDatabase } from './client.js';
import {
  aiGenerations,
  outboxEvents,
  prompts,
  promptVersions,
  type AiGenerationRecord,
} from './schema.js';

export interface QueuedGeneration {
  generation: AiGenerationRecord;
  job: GenerationJob;
}

export class GenerationCommandStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  async create(ownerUserId: string, input: CreateGeneration): Promise<QueuedGeneration> {
    return this.client.db.transaction(async (transaction) => {
      const [resolvedPrompt] = await transaction
        .select({
          promptVersionId: promptVersions.id,
          body: promptVersions.body,
        })
        .from(promptVersions)
        .innerJoin(prompts, eq(prompts.id, promptVersions.promptId))
        .where(
          and(
            eq(prompts.ownerUserId, ownerUserId),
            eq(prompts.capabilityKey, input.capabilityKey),
            isNull(prompts.archivedAt),
            eq(promptVersions.status, 'active'),
          ),
        )
        .orderBy(
          desc(promptVersions.isDefault),
          desc(promptVersions.activatedAt),
          desc(promptVersions.versionNumber),
        )
        .limit(1);

      if (!resolvedPrompt) {
        throw new Error(`No active prompt is available for capability "${input.capabilityKey}".`);
      }

      const generationId = crypto.randomUUID();
      const job: GenerationJob = {
        generationId,
        providerKey: input.providerKey,
        request: {
          generationId,
          capabilityKey: input.capabilityKey,
          systemPrompt: resolvedPrompt.body,
          userPrompt: JSON.stringify(input.input),
          model: input.model,
          temperature: input.temperature,
          metadata: {},
          ...(input.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: input.maxOutputTokens }),
        },
      };

      const [generation] = await transaction
        .insert(aiGenerations)
        .values({
          id: generationId,
          ownerUserId,
          capabilityKey: input.capabilityKey,
          promptVersionId: resolvedPrompt.promptVersionId,
          providerKey: input.providerKey,
          model: input.model,
          inputSnapshot: input.input,
          modelSnapshot: {
            providerKey: input.providerKey,
            model: input.model,
            temperature: input.temperature,
            ...(input.maxOutputTokens === undefined
              ? {}
              : { maxOutputTokens: input.maxOutputTokens }),
          },
        })
        .returning();
      if (!generation) throw new Error('Generation creation failed.');

      await transaction.insert(outboxEvents).values({
        idempotencyKey: `generation:${generationId}:queued`,
        aggregateType: 'ai_generation',
        aggregateId: generationId,
        eventType: 'generation.queued',
        payload: job,
      });

      return { generation, job };
    });
  }

  async get(ownerUserId: string, generationId: string): Promise<AiGenerationRecord | null> {
    const [generation] = await this.client.db
      .select()
      .from(aiGenerations)
      .where(and(eq(aiGenerations.id, generationId), eq(aiGenerations.ownerUserId, ownerUserId)))
      .limit(1);
    return generation ?? null;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
