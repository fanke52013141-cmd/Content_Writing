import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function applyMigration(database: PGlite, name: string): Promise<void> {
  await database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
}

describe('article version persistence policy', () => {
  let database: PGlite;
  let userId: string;
  let articleId: string;
  let versionId: string;

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
      '0008_articles_reviews.sql',
    ]) {
      await applyMigration(database, migration);
    }
    userId = (await database.query<{ id: string }>('SELECT id FROM local_users')).rows[0]?.id ?? '';
    articleId =
      (
        await database.query<{ id: string }>(
          `INSERT INTO content_objects (owner_user_id, object_type) VALUES ('${userId}', 'article') RETURNING id`,
        )
      ).rows[0]?.id ?? '';
    await database.exec(`
      INSERT INTO articles (id, owner_user_id, title) VALUES ('${articleId}', '${userId}', '文章');
    `);
    versionId = crypto.randomUUID();
    await database.exec(`
      INSERT INTO article_versions
        (id, owner_user_id, article_id, version_number, title, body, kind, status, accepted_at)
      VALUES ('${versionId}', '${userId}', '${articleId}', 1, '文章', '正文', 'manual', 'current', now());
      UPDATE articles SET current_version_id = '${versionId}' WHERE id = '${articleId}';
    `);
  });

  afterEach(async () => {
    await database.close();
  });

  it('rejects article rows whose content object is not article-typed', async () => {
    const otherObjectId = crypto.randomUUID();
    await database.exec(
      `INSERT INTO content_objects (id, owner_user_id, object_type) VALUES ('${otherObjectId}', '${userId}', 'topic')`,
    );
    await expect(
      database.exec(
        `INSERT INTO articles (id, owner_user_id, title) VALUES ('${otherObjectId}', '${userId}', '错误')`,
      ),
    ).rejects.toThrow();
  });

  it('keeps version content immutable while allowing lifecycle status changes', async () => {
    await expect(
      database.exec(`UPDATE article_versions SET body = '覆盖正文' WHERE id = '${versionId}'`),
    ).rejects.toThrow();
    await database.exec(
      `UPDATE article_versions SET status = 'superseded' WHERE id = '${versionId}'`,
    );
    const row = (
      await database.query<{ status: string }>(
        `SELECT status FROM article_versions WHERE id = '${versionId}'`,
      )
    ).rows[0];
    expect(row?.status).toBe('superseded');
  });

  it('enforces review capability keys and version ownership', async () => {
    await expect(
      database.exec(`
        INSERT INTO article_reviews (owner_user_id, article_id, version_id, capability_key, verdict, summary)
        VALUES ('${userId}', '${articleId}', '${versionId}', 'review.unknown', 'pass', '不应通过')
      `),
    ).rejects.toThrow();
    await database.exec(`
      INSERT INTO article_reviews (owner_user_id, article_id, version_id, capability_key, verdict, summary, findings)
      VALUES ('${userId}', '${articleId}', '${versionId}', 'review.readability', 'pass', '可读性良好', '[]'::jsonb)
    `);
    const row = (
      await database.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM article_reviews WHERE article_id = '${articleId}'`,
      )
    ).rows[0];
    expect(row?.count).toBe('1');
  });
});
