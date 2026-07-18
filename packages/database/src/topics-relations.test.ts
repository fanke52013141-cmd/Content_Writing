import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function applyMigration(database: PGlite, name: string): Promise<void> {
  const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await database.exec(migration);
}

describe('topics and relation policy migration', () => {
  let database: PGlite;
  let userId: string;
  let projectId: string;
  let topicOne: string;
  let topicTwo: string;

  beforeEach(async () => {
    database = new PGlite();
    for (const migration of [
      '0000_foundation.sql',
      '0001_generation_trace.sql',
      '0003_account_profiles.sql',
      '0004_content_projects.sql',
      '0005_topics_relations.sql',
    ]) {
      await applyMigration(database, migration);
    }
    const user = await database.query<{ id: string }>('SELECT id FROM local_users');
    userId = user.rows[0]?.id ?? '';
    const objects = await database.query<{ id: string; object_type: string }>(`
      INSERT INTO content_objects (owner_user_id, object_type)
      VALUES ('${userId}', 'project'), ('${userId}', 'topic'), ('${userId}', 'topic')
      RETURNING id, object_type
    `);
    projectId = objects.rows.find((item) => item.object_type === 'project')?.id ?? '';
    const topicIds = objects.rows
      .filter((item) => item.object_type === 'topic')
      .map((item) => item.id);
    topicOne = topicIds[0] ?? '';
    topicTwo = topicIds[1] ?? '';
    await database.exec(`
      INSERT INTO content_projects (id, owner_user_id, title, creation_origin)
      VALUES ('${projectId}', '${userId}', '项目', 'blank');
      INSERT INTO topics (id, owner_user_id, title)
      VALUES ('${topicOne}', '${userId}', '选题一'), ('${topicTwo}', '${userId}', '选题二');
    `);
  });

  afterEach(async () => {
    await database.close();
  });

  it('requires topics to use topic-typed content objects', async () => {
    await expect(
      database.exec(`
        INSERT INTO topics (id, owner_user_id, title)
        VALUES ('${projectId}', '${userId}', '错误选题')
      `),
    ).rejects.toThrow('topic requires a topic content object');
  });

  it('enforces the relation whitelist direction and scope', async () => {
    await expect(
      database.exec(`
        INSERT INTO content_relations (
          owner_user_id, from_object_id, to_object_id, relation_type, project_scope_id
        ) VALUES (
          '${userId}', '${topicOne}', '${projectId}', 'project_has_topic', '${projectId}'
        )
      `),
    ).rejects.toThrow('invalid project_has_topic');
  });

  it('allows at most one primary topic per project', async () => {
    await database.exec(`
      INSERT INTO content_relations (
        owner_user_id, from_object_id, to_object_id,
        relation_type, project_scope_id, is_primary
      ) VALUES (
        '${userId}', '${projectId}', '${topicOne}',
        'project_has_topic', '${projectId}', true
      )
    `);
    await expect(
      database.exec(`
        INSERT INTO content_relations (
          owner_user_id, from_object_id, to_object_id,
          relation_type, project_scope_id, is_primary
        ) VALUES (
          '${userId}', '${projectId}', '${topicTwo}',
          'project_has_topic', '${projectId}', true
        )
      `),
    ).rejects.toThrow();
  });

  it('keeps AI topic candidate content immutable before user acceptance', async () => {
    const generation = await database.query<{ id: string }>(`
      WITH prompt AS (
        INSERT INTO prompts (owner_user_id, capability_key, name)
        VALUES ('${userId}', 'topic.hot-filter', '选题提示') RETURNING id
      ), version AS (
        INSERT INTO prompt_versions (prompt_id, version_number, status, body)
        SELECT id, 1, 'active', '生成候选选题' FROM prompt RETURNING id
      )
      INSERT INTO ai_generations (
        owner_user_id, capability_key, prompt_version_id, provider_key,
        model, input_snapshot, model_snapshot
      )
      SELECT '${userId}', 'topic.hot-filter', version.id, 'mock',
        'mock-writer', '{}', '{}' FROM version RETURNING ai_generations.id
    `);
    const object = await database.query<{ id: string }>(`
      INSERT INTO content_objects (owner_user_id, object_type)
      VALUES ('${userId}', 'topic') RETURNING id
    `);
    const topicId = object.rows[0]?.id ?? '';
    await database.exec(`
      INSERT INTO topics (id, owner_user_id, title, source, source_generation_id)
      VALUES ('${topicId}', '${userId}', 'AI 候选选题', 'ai', '${generation.rows[0]?.id ?? ''}')
    `);

    await expect(
      database.exec(`UPDATE topics SET title = '原地覆盖' WHERE id = '${topicId}'`),
    ).rejects.toThrow('immutable');
  });

  it('ends a relation without deleting either reusable object or relation history', async () => {
    const relation = await database.query<{ id: string }>(`
      INSERT INTO content_relations (
        owner_user_id, from_object_id, to_object_id,
        relation_type, project_scope_id, is_primary
      ) VALUES (
        '${userId}', '${projectId}', '${topicOne}',
        'project_has_topic', '${projectId}', true
      ) RETURNING id
    `);
    await database.exec(`
      UPDATE content_relations SET ended_at = now(), is_primary = false
      WHERE id = '${relation.rows[0]?.id ?? ''}'
    `);
    const counts = await database.query<{ topics: number; relations: number }>(`
      SELECT
        (SELECT count(*)::int FROM topics WHERE id = '${topicOne}') AS topics,
        (SELECT count(*)::int FROM content_relations WHERE id = '${relation.rows[0]?.id ?? ''}') AS relations
    `);
    expect(counts.rows[0]).toEqual({ topics: 1, relations: 1 });
  });
});
