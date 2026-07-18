import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function applyMigration(database: PGlite, name: string): Promise<void> {
  const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await database.exec(migration);
}

describe('prompt and generation trace migration', () => {
  let database: PGlite;
  let promptId: string;
  let userId: string;

  beforeEach(async () => {
    database = new PGlite();
    await applyMigration(database, '0000_foundation.sql');
    await applyMigration(database, '0001_generation_trace.sql');
    const users = await database.query<{ id: string }>('SELECT id FROM local_users');
    userId = users.rows[0]?.id ?? '';
    const prompts = await database.query<{ id: string }>(`
      INSERT INTO prompts (owner_user_id, capability_key, name)
      VALUES ('${userId}', 'article.write', '正文写作示例') RETURNING id
    `);
    promptId = prompts.rows[0]?.id ?? '';
  });

  afterEach(async () => {
    await database.close();
  });

  it('allows multiple active versions but only one default active version', async () => {
    await database.exec(`
      INSERT INTO prompt_versions (prompt_id, version_number, status, is_default, body)
      VALUES ('${promptId}', 1, 'active', true, 'V1'),
             ('${promptId}', 2, 'active', false, 'V2')
    `);
    await expect(
      database.exec(`
        UPDATE prompt_versions SET is_default = true
        WHERE prompt_id = '${promptId}' AND version_number = 2
      `),
    ).rejects.toThrow();
  });

  it('requires a default version to be active', async () => {
    await expect(
      database.exec(`
        INSERT INTO prompt_versions (prompt_id, version_number, status, is_default, body)
        VALUES ('${promptId}', 1, 'draft', true, 'Draft')
      `),
    ).rejects.toThrow();
  });

  it('keeps active prompt content immutable while allowing deprecation', async () => {
    await database.exec(`
      INSERT INTO prompt_versions (prompt_id, version_number, status, body)
      VALUES ('${promptId}', 1, 'active', 'Frozen body')
    `);
    await expect(
      database.exec(`
        UPDATE prompt_versions SET body = 'Changed body'
        WHERE prompt_id = '${promptId}' AND version_number = 1
      `),
    ).rejects.toThrow('immutable');
    await expect(
      database.exec(`
        UPDATE prompt_versions SET status = 'deprecated', deprecated_at = now()
        WHERE prompt_id = '${promptId}' AND version_number = 1
      `),
    ).resolves.not.toThrow();
  });

  it('keeps generation snapshots immutable and permits lifecycle updates', async () => {
    const versions = await database.query<{ id: string }>(`
      INSERT INTO prompt_versions (prompt_id, version_number, status, body)
      VALUES ('${promptId}', 1, 'active', 'Frozen body') RETURNING id
    `);
    const versionId = versions.rows[0]?.id ?? '';
    const generations = await database.query<{ id: string }>(`
      INSERT INTO ai_generations (
        owner_user_id, capability_key, prompt_version_id, provider_key, model,
        input_snapshot, model_snapshot
      ) VALUES (
        '${userId}', 'article.write', '${versionId}', 'mock', 'mock-writer',
        '{"topic":"test"}'::jsonb, '{"temperature":0.7}'::jsonb
      ) RETURNING id
    `);
    const generationId = generations.rows[0]?.id ?? '';

    await expect(
      database.exec(`
        UPDATE ai_generations SET status = 'succeeded', output_text = 'candidate',
          completed_at = now() WHERE id = '${generationId}'
      `),
    ).resolves.not.toThrow();
    await expect(
      database.exec(`
        UPDATE ai_generations SET input_snapshot = '{"topic":"changed"}'::jsonb
        WHERE id = '${generationId}'
      `),
    ).rejects.toThrow('immutable');
  });

  it('orders generation events with a unique nonnegative sequence', async () => {
    const versions = await database.query<{ id: string }>(`
      INSERT INTO prompt_versions (prompt_id, version_number, status, body)
      VALUES ('${promptId}', 1, 'active', 'Frozen body') RETURNING id
    `);
    const versionId = versions.rows[0]?.id ?? '';
    const generations = await database.query<{ id: string }>(`
      INSERT INTO ai_generations (
        owner_user_id, capability_key, prompt_version_id, provider_key, model,
        input_snapshot, model_snapshot
      ) VALUES (
        '${userId}', 'article.write', '${versionId}', 'mock', 'mock-writer', '{}', '{}'
      ) RETURNING id
    `);
    const generationId = generations.rows[0]?.id ?? '';
    await database.exec(`
      INSERT INTO generation_events (generation_id, sequence, event_type)
      VALUES ('${generationId}', 0, 'started')
    `);

    await expect(
      database.exec(`
        INSERT INTO generation_events (generation_id, sequence, event_type)
        VALUES ('${generationId}', 0, 'duplicate')
      `),
    ).rejects.toThrow();
    await expect(
      database.exec(`
        INSERT INTO generation_events (generation_id, sequence, event_type)
        VALUES ('${generationId}', -1, 'invalid')
      `),
    ).rejects.toThrow();
  });
});
