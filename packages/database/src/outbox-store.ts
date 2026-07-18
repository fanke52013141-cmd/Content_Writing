import postgres from 'postgres';

export interface ClaimedOutboxEvent {
  id: string;
  aggregateId: string | null;
  eventType: string;
  payload: unknown;
  attempts: number;
}

export class OutboxStore {
  private readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 2, prepare: false });
  }

  async claimPending(limit: number): Promise<readonly ClaimedOutboxEvent[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Outbox claim limit must be an integer between 1 and 100.');
    }

    return this.sql.begin(async (transaction) => {
      const rows = await transaction<
        {
          id: string;
          aggregate_id: string | null;
          event_type: string;
          payload: unknown;
          attempts: number;
        }[]
      >`
        WITH candidates AS (
          SELECT id
          FROM outbox_events
          WHERE status IN ('pending', 'failed')
            AND available_at <= now()
            AND attempts < 10
          ORDER BY occurred_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE outbox_events AS event
        SET status = 'processing', attempts = event.attempts + 1, last_error = NULL
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.id, event.aggregate_id, event.event_type, event.payload, event.attempts
      `;

      return rows.map((row) => ({
        id: row.id,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        payload: row.payload,
        attempts: row.attempts,
      }));
    });
  }

  async markCompleted(eventId: string): Promise<void> {
    await this.sql`
      UPDATE outbox_events
      SET status = 'completed', processed_at = now(), last_error = NULL
      WHERE id = ${eventId}
    `;
  }

  async markFailed(eventId: string, message: string, retryDelaySeconds: number): Promise<void> {
    const delay = Math.max(1, Math.min(3600, Math.floor(retryDelaySeconds)));
    await this.sql`
      UPDATE outbox_events
      SET status = 'failed',
          last_error = ${message.slice(0, 4000)},
          available_at = now() + (${delay} * interval '1 second')
      WHERE id = ${eventId}
    `;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
