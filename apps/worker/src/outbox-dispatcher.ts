import { generationJobSchema, type GenerationJob } from '@content-writing/contracts';
import { OutboxStore, type ClaimedOutboxEvent } from '@content-writing/database';
import type { Queue } from 'bullmq';

export interface OutboxRepository {
  claimPending(limit: number): Promise<readonly ClaimedOutboxEvent[]>;
  markCompleted(eventId: string): Promise<void>;
  markFailed(eventId: string, message: string, retryDelaySeconds: number): Promise<void>;
  close?(): Promise<void>;
}

export interface GenerationQueuePublisher {
  publish(eventId: string, job: GenerationJob): Promise<void>;
}

export class BullGenerationQueuePublisher implements GenerationQueuePublisher {
  constructor(private readonly queue: Queue<GenerationJob>) {}

  async publish(eventId: string, job: GenerationJob): Promise<void> {
    await this.queue.add('generate', job, {
      jobId: eventId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800, count: 1_000 },
    });
  }
}

export class PostgresOutboxRepository implements OutboxRepository {
  private readonly store: OutboxStore;

  constructor(databaseUrl: string) {
    this.store = new OutboxStore(databaseUrl);
  }

  claimPending(limit: number): Promise<readonly ClaimedOutboxEvent[]> {
    return this.store.claimPending(limit);
  }

  markCompleted(eventId: string): Promise<void> {
    return this.store.markCompleted(eventId);
  }

  markFailed(eventId: string, message: string, retryDelaySeconds: number): Promise<void> {
    return this.store.markFailed(eventId, message, retryDelaySeconds);
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown outbox dispatch error';
}

export class OutboxDispatcher {
  private timer: NodeJS.Timeout | undefined;
  private dispatching = false;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: GenerationQueuePublisher,
  ) {}

  async dispatchOnce(limit = 20): Promise<number> {
    const events = await this.repository.claimPending(limit);

    for (const event of events) {
      try {
        if (event.eventType !== 'generation.queued') {
          throw new Error(`Unsupported outbox event type "${event.eventType}".`);
        }
        const job = generationJobSchema.parse(event.payload);
        await this.publisher.publish(event.id, job);
        await this.repository.markCompleted(event.id);
      } catch (error) {
        const retryDelaySeconds = Math.min(300, 2 ** Math.min(event.attempts, 8));
        await this.repository.markFailed(event.id, errorMessage(error), retryDelaySeconds);
      }
    }

    return events.length;
  }

  start(intervalMilliseconds = 1_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.dispatching) return;
      this.dispatching = true;
      void this.dispatchOnce().finally(() => {
        this.dispatching = false;
      });
    }, intervalMilliseconds);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
