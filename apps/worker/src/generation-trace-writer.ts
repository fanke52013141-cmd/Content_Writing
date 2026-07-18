import type { ModelEvent } from '@content-writing/contracts';
import { GenerationTraceStore } from '@content-writing/database';

export interface GenerationTraceWriter {
  markRunning(generationId: string): Promise<void>;
  appendEvent(generationId: string, sequence: number, event: ModelEvent): Promise<void>;
  markSucceeded(generationId: string, outputText: string): Promise<void>;
  markFailed(generationId: string, code: string, message: string): Promise<void>;
  close?(): Promise<void>;
}

export class PostgresGenerationTraceWriter implements GenerationTraceWriter {
  private readonly store: GenerationTraceStore;

  constructor(databaseUrl: string) {
    this.store = new GenerationTraceStore(databaseUrl);
  }

  markRunning(generationId: string): Promise<void> {
    return this.store.markRunning(generationId);
  }

  appendEvent(generationId: string, sequence: number, event: ModelEvent): Promise<void> {
    return this.store.appendEvent(generationId, sequence, event);
  }

  markSucceeded(generationId: string, outputText: string): Promise<void> {
    return this.store.markSucceeded(generationId, outputText);
  }

  markFailed(generationId: string, code: string, message: string): Promise<void> {
    return this.store.markFailed(generationId, code, message);
  }

  close(): Promise<void> {
    return this.store.close();
  }
}
