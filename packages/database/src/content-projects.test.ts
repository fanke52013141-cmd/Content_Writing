import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function applyMigration(database: PGlite, name: string): Promise<void> {
  const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await database.exec(migration);
}

describe('content project migration', () => {
  let database: PGlite;
  let userId: string;
  let accountOne: string;
  let accountTwo: string;
  let projectId: string;

  beforeEach(async () => {
    database = new PGlite();
    await applyMigration(database, '0000_foundation.sql');
    await applyMigration(database, '0001_generation_trace.sql');
    await applyMigration(database, '0003_account_profiles.sql');
    await applyMigration(database, '0004_content_projects.sql');
    const user = await database.query<{ id: string }>('SELECT id FROM local_users');
    userId = user.rows[0]?.id ?? '';
    const accounts = await database.query<{ id: string }>(`
      INSERT INTO accounts (owner_user_id, name)
      VALUES ('${userId}', '账号一'), ('${userId}', '账号二') RETURNING id
    `);
    accountOne = accounts.rows[0]?.id ?? '';
    accountTwo = accounts.rows[1]?.id ?? '';
    const object = await database.query<{ id: string }>(`
      INSERT INTO content_objects (owner_user_id, object_type)
      VALUES ('${userId}', 'project') RETURNING id
    `);
    projectId = object.rows[0]?.id ?? '';
    await database.exec(`
      INSERT INTO content_projects (id, owner_user_id, title, creation_origin)
      VALUES ('${projectId}', '${userId}', '第一篇文章', 'idea')
    `);
  });

  afterEach(async () => {
    await database.close();
  });

  it('requires every project to use a project-typed content object', async () => {
    const topicObject = await database.query<{ id: string }>(`
      INSERT INTO content_objects (owner_user_id, object_type)
      VALUES ('${userId}', 'topic') RETURNING id
    `);
    await expect(
      database.exec(`
        INSERT INTO content_projects (id, owner_user_id, title, creation_origin)
        VALUES ('${topicObject.rows[0]?.id ?? ''}', '${userId}', '错误对象', 'blank')
      `),
    ).rejects.toThrow('requires a project content object');
  });

  it('allows at most one primary account per project', async () => {
    await database.exec(`
      INSERT INTO project_accounts (project_id, account_id, owner_user_id, is_primary)
      VALUES ('${projectId}', '${accountOne}', '${userId}', true)
    `);
    await expect(
      database.exec(`
        INSERT INTO project_accounts (project_id, account_id, owner_user_id, is_primary)
        VALUES ('${projectId}', '${accountTwo}', '${userId}', true)
      `),
    ).rejects.toThrow();
  });

  it('removes a project link without deleting the reusable account', async () => {
    await database.exec(`
      INSERT INTO project_accounts (project_id, account_id, owner_user_id, is_primary)
      VALUES ('${projectId}', '${accountOne}', '${userId}', true);
      DELETE FROM project_accounts
      WHERE project_id = '${projectId}' AND account_id = '${accountOne}';
    `);
    const account = await database.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM accounts WHERE id = '${accountOne}'
    `);
    expect(account.rows[0]?.count).toBe(1);
  });

  it('tracks completed and archived project lifecycle without automatic completion', async () => {
    const initial = await database.query<{ status: string }>(`
      SELECT status FROM content_objects WHERE id = '${projectId}'
    `);
    expect(initial.rows[0]?.status).toBe('active');
    await database.exec(`
      UPDATE content_objects SET status = 'completed' WHERE id = '${projectId}';
      UPDATE content_projects SET completed_at = now() WHERE id = '${projectId}';
    `);
    const completed = await database.query<{ status: string }>(`
      SELECT status FROM content_objects WHERE id = '${projectId}'
    `);
    expect(completed.rows[0]?.status).toBe('completed');
  });
});
