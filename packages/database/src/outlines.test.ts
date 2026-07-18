import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function applyMigration(database: PGlite, name: string): Promise<void> {
  await database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
}

describe('outline persistence policy', () => {
  let database: PGlite;
  let userId: string;
  let outlineId: string;

  beforeEach(async () => {
    database = new PGlite();
    for (const migration of [
      '0000_foundation.sql',
      '0001_generation_trace.sql',
      '0003_account_profiles.sql',
      '0004_content_projects.sql',
      '0005_topics_relations.sql',
      '0006_materials_files.sql',
      '0007_outlines.sql',
    ]) {
      await applyMigration(database, migration);
    }
    userId = (await database.query<{ id: string }>('SELECT id FROM local_users')).rows[0]?.id ?? '';
    outlineId =
      (
        await database.query<{ id: string }>(
          `INSERT INTO content_objects (owner_user_id, object_type) VALUES ('${userId}', 'outline') RETURNING id`,
        )
      ).rows[0]?.id ?? '';
  });

  afterEach(async () => {
    await database.close();
  });

  it('requires an outline-typed content object and a JSON array of sections', async () => {
    await database.exec(`
      INSERT INTO outlines (id, owner_user_id, title, sections)
      VALUES ('${outlineId}', '${userId}', '文章框架', '[{"heading":"开场"}]'::jsonb)
    `);
    await expect(
      database.exec(`
        INSERT INTO outlines (id, owner_user_id, title, sections)
        VALUES ('${userId}', '${userId}', '错误框架', '{}'::jsonb)
      `),
    ).rejects.toThrow();
  });

  it('keeps manual outlines free of AI generation provenance', async () => {
    await expect(
      database.exec(`
        INSERT INTO outlines (id, owner_user_id, title, sections, source, source_generation_id)
        VALUES ('${outlineId}', '${userId}', '伪造框架', '[]'::jsonb, 'manual', gen_random_uuid())
      `),
    ).rejects.toThrow();
  });
});
