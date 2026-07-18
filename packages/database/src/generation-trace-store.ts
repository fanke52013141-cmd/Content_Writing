import type { ModelEvent } from '@content-writing/contracts';
import { eq } from 'drizzle-orm';

import { createDatabase } from './client.js';
import { aiGenerations, generationEvents } from './schema.js';

export class GenerationTraceStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  async markRunning(generationId: string): Promise<void> {
    await this.client.db
      .update(aiGenerations)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(aiGenerations.id, generationId));
  }

  async appendEvent(generationId: string, sequence: number, event: ModelEvent): Promise<void> {
    await this.client.db.insert(generationEvents).values({
      generationId,
      sequence,
      eventType: event.type,
      payload: event,
    });
  }

  async markSucceeded(generationId: string, outputText: string): Promise<void> {
    await this.client.db
      .update(aiGenerations)
      .set({
        status: 'succeeded',
        outputText,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(aiGenerations.id, generationId));
  }

  async markFailed(generationId: string, code: string, message: string): Promise<void> {
    await this.client.db
      .update(aiGenerations)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorCode: code,
        errorMessage: message,
      })
      .where(eq(aiGenerations.id, generationId));
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
