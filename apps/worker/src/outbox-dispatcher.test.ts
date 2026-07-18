import type { GenerationJob } from '@content-writing/contracts';
import type { ClaimedOutboxEvent } from '@content-writing/database';
import { describe, expect, it } from 'vitest';

import {
  OutboxDispatcher,
  type GenerationQueuePublisher,
  type OutboxRepository,
} from './outbox-dispatcher.js';

const generationId = '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7';
const job: GenerationJob = {
  generationId,
  providerKey: 'mock',
  request: {
    generationId,
    capabilityKey: 'article.write',
    systemPrompt: 'Write a candidate.',
    userPrompt: 'Topic',
    model: 'mock-writer',
    temperature: 0.7,
    metadata: {},
  },
};

class MemoryOutboxRepository implements OutboxRepository {
  readonly completed: string[] = [];
  readonly failed: Array<{ id: string; message: string; delay: number }> = [];

  constructor(private readonly events: readonly ClaimedOutboxEvent[]) {}

  claimPending(): Promise<readonly ClaimedOutboxEvent[]> {
    return Promise.resolve(this.events);
  }

  markCompleted(eventId: string): Promise<void> {
    this.completed.push(eventId);
    return Promise.resolve();
  }

  markFailed(eventId: string, message: string, retryDelaySeconds: number): Promise<void> {
    this.failed.push({ id: eventId, message, delay: retryDelaySeconds });
    return Promise.resolve();
  }
}

class MemoryPublisher implements GenerationQueuePublisher {
  readonly published: string[] = [];

  constructor(private readonly failingIds = new Set<string>()) {}

  publish(eventId: string): Promise<void> {
    if (this.failingIds.has(eventId)) return Promise.reject(new Error('Redis unavailable'));
    this.published.push(eventId);
    return Promise.resolve();
  }
}

function event(id: string, overrides: Partial<ClaimedOutboxEvent> = {}): ClaimedOutboxEvent {
  return {
    id,
    aggregateId: generationId,
    eventType: 'generation.queued',
    payload: job,
    attempts: 1,
    ...overrides,
  };
}

describe('outbox dispatcher', () => {
  it('publishes and completes a valid generation event', async () => {
    const repository = new MemoryOutboxRepository([event('event-1')]);
    const publisher = new MemoryPublisher();
    const dispatcher = new OutboxDispatcher(repository, publisher);

    await expect(dispatcher.dispatchOnce()).resolves.toBe(1);
    expect(publisher.published).toEqual(['event-1']);
    expect(repository.completed).toEqual(['event-1']);
    expect(repository.failed).toEqual([]);
  });

  it('records a retry without blocking subsequent events', async () => {
    const repository = new MemoryOutboxRepository([event('event-1'), event('event-2')]);
    const publisher = new MemoryPublisher(new Set(['event-1']));
    const dispatcher = new OutboxDispatcher(repository, publisher);

    await expect(dispatcher.dispatchOnce()).resolves.toBe(2);
    expect(repository.failed[0]).toMatchObject({ id: 'event-1', message: 'Redis unavailable' });
    expect(publisher.published).toEqual(['event-2']);
    expect(repository.completed).toEqual(['event-2']);
  });

  it('rejects unknown event types before queue publication', async () => {
    const repository = new MemoryOutboxRepository([
      event('event-1', { eventType: 'unknown.event' }),
    ]);
    const publisher = new MemoryPublisher();
    const dispatcher = new OutboxDispatcher(repository, publisher);

    await dispatcher.dispatchOnce();
    expect(publisher.published).toEqual([]);
    expect(repository.failed[0]?.message).toContain('Unsupported outbox event type');
  });
});
