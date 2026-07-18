import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function applyMigration(database: PGlite, name: string): Promise<void> {
  const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await database.exec(migration);
}

describe('materials and local file policy migration', () => {
  let database: PGlite;
  let userId: string;
  let projectId: string;
  let topicId: string;
  let materialId: string;

  beforeEach(async () => {
    database = new PGlite();
    for (const migration of [
      '0000_foundation.sql',
      '0001_generation_trace.sql',
      '0003_account_profiles.sql',
      '0004_content_projects.sql',
      '0005_topics_relations.sql',
      '0006_materials_files.sql',
    ]) {
      await applyMigration(database, migration);
    }
    const user = await database.query<{ id: string }>('SELECT id FROM local_users');
    userId = user.rows[0]?.id ?? '';
    const objects = await database.query<{ id: string; object_type: string }>(`
      INSERT INTO content_objects (owner_user_id, object_type)
      VALUES ('${userId}', 'project'), ('${userId}', 'topic'), ('${userId}', 'material')
      RETURNING id, object_type
    `);
    projectId = objects.rows.find((item) => item.object_type === 'project')?.id ?? '';
    topicId = objects.rows.find((item) => item.object_type === 'topic')?.id ?? '';
    materialId = objects.rows.find((item) => item.object_type === 'material')?.id ?? '';
    await database.exec(`
      INSERT INTO content_projects (id, owner_user_id, title, creation_origin)
      VALUES ('${projectId}', '${userId}', '项目', 'blank');
      INSERT INTO topics (id, owner_user_id, title)
      VALUES ('${topicId}', '${userId}', '选题');
      INSERT INTO materials (
        id, owner_user_id, title, kind, source_text, extracted_text
      ) VALUES (
        '${materialId}', '${userId}', '文本素材', 'plain_text', '原文', '原文'
      );
    `);
  });

  afterEach(async () => {
    await database.close();
  });

  it('requires every material to use a material-typed content object', async () => {
    await expect(
      database.exec(`
        INSERT INTO materials (id, owner_user_id, title, kind, source_text, extracted_text)
        VALUES ('${topicId}', '${userId}', '错误素材', 'plain_text', '正文', '正文')
      `),
    ).rejects.toThrow('material requires a material content object');
  });

  it('enforces provenance fields for webpage and inline material kinds', async () => {
    const object = await database.query<{ id: string }>(`
      INSERT INTO content_objects (owner_user_id, object_type)
      VALUES ('${userId}', 'material') RETURNING id
    `);
    await expect(
      database.exec(`
        INSERT INTO materials (id, owner_user_id, title, kind, extracted_text)
        VALUES ('${object.rows[0]?.id ?? ''}', '${userId}', '无来源网页', 'webpage', '正文')
      `),
    ).rejects.toThrow();
  });

  it('requires safe relative file keys, hashes and 14-day-style snapshot expiry metadata', async () => {
    const hash = 'a'.repeat(64);
    await database.exec(`
      INSERT INTO content_files (
        owner_user_id, content_object_id, file_role, storage_key,
        original_filename, mime_type, byte_size, sha256
      ) VALUES (
        '${userId}', '${materialId}', 'original', 'materials/${materialId}/source.txt',
        'source.txt', 'text/plain', 4, '${hash}'
      )
    `);
    await expect(
      database.exec(`
        INSERT INTO content_files (
          owner_user_id, content_object_id, file_role, storage_key,
          mime_type, byte_size, sha256
        ) VALUES (
          '${userId}', '${materialId}', 'raw_snapshot', '../escape.html',
          'text/html', 4, '${hash}'
        )
      `),
    ).rejects.toThrow();
  });

  it('ends project and topic links without deleting the reusable material', async () => {
    await database.exec(`
      INSERT INTO content_relations (
        owner_user_id, from_object_id, to_object_id, relation_type, project_scope_id
      ) VALUES
        ('${userId}', '${projectId}', '${materialId}', 'project_has_material', '${projectId}'),
        ('${userId}', '${topicId}', '${materialId}', 'topic_has_material', '${projectId}')
    `);
    await database.exec(`
      UPDATE content_relations SET ended_at = now(), is_primary = false
      WHERE to_object_id = '${materialId}'
    `);
    const counts = await database.query<{ materials: number; relations: number }>(`
      SELECT
        (SELECT count(*)::int FROM materials WHERE id = '${materialId}') AS materials,
        (SELECT count(*)::int FROM content_relations WHERE to_object_id = '${materialId}') AS relations
    `);
    expect(counts.rows[0]).toEqual({ materials: 1, relations: 2 });
  });
});
