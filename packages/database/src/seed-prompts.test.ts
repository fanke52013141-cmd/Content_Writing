import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

async function applyMigration(database: PGlite, name: string): Promise<void> {
  const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await database.exec(migration);
}

describe('seed prompts', () => {
  let database: PGlite;

  beforeAll(async () => {
    database = new PGlite();
    await applyMigration(database, '0000_foundation.sql');
    await applyMigration(database, '0001_generation_trace.sql');
    await applyMigration(database, '0002_seed_prompts.sql');
  });

  afterAll(async () => {
    await database.close();
  });

  it('provides one runnable default prompt for every V1 capability', async () => {
    const result = await database.query<{
      capability_key: string;
      status: string;
      is_default: boolean;
      body: string;
    }>(`
      SELECT p.capability_key, pv.status, pv.is_default, pv.body
      FROM prompts p JOIN prompt_versions pv ON pv.prompt_id = p.id
      ORDER BY p.capability_key
    `);

    expect(result.rows).toHaveLength(10);
    expect(result.rows.every((row) => row.status === 'active' && row.is_default)).toBe(true);
    expect(result.rows.every((row) => row.body.length >= 20)).toBe(true);
  });

  it('ships exactly the three approved reviewer prompts', async () => {
    const result = await database.query<{ capability_key: string }>(`
      SELECT capability_key FROM prompts
      WHERE capability_key LIKE 'review.%'
      ORDER BY capability_key
    `);

    expect(result.rows.map((row) => row.capability_key)).toEqual([
      'review.fact-risk',
      'review.positioning',
      'review.readability',
    ]);
  });
});
