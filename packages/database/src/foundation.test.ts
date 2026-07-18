import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('foundation migration', () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    const migrationUrl = new URL('../migrations/0000_foundation.sql', import.meta.url);
    const migration = await readFile(migrationUrl, 'utf8');
    await database.exec(migration);
  });

  afterEach(async () => {
    await database.close();
  });

  it('creates exactly one default local user', async () => {
    const result = await database.query<{ display_name: string; pin_enabled: boolean }>(
      'SELECT display_name, pin_enabled FROM local_users',
    );

    expect(result.rows).toEqual([{ display_name: '本地创作者', pin_enabled: false }]);
  });

  it('enforces the single-user invariant in the database', async () => {
    await expect(
      database.exec("INSERT INTO local_users (display_name) VALUES ('第二位用户')"),
    ).rejects.toThrow();
  });

  it('requires a PIN hash whenever local PIN login is enabled', async () => {
    await expect(
      database.exec('UPDATE local_users SET pin_enabled = true, pin_hash = NULL'),
    ).rejects.toThrow();

    await expect(
      database.exec("UPDATE local_users SET pin_enabled = true, pin_hash = 'hash'"),
    ).resolves.not.toThrow();
  });

  it('deduplicates outbox work by idempotency key', async () => {
    const insert = `
      INSERT INTO outbox_events (idempotency_key, aggregate_type, event_type)
      VALUES ('account:1:created', 'account', 'account.created')
    `;

    await database.exec(insert);
    await expect(database.exec(insert)).rejects.toThrow();
  });

  it('prevents negative delivery attempts', async () => {
    await expect(
      database.exec(`
        INSERT INTO outbox_events (
          idempotency_key, aggregate_type, event_type, attempts
        ) VALUES ('invalid-attempts', 'test', 'test.invalid', -1)
      `),
    ).rejects.toThrow();
  });
});
