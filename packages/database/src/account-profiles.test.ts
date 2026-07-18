import { readFile } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function applyMigration(database: PGlite, name: string): Promise<void> {
  const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await database.exec(migration);
}

describe('account profile migration', () => {
  let database: PGlite;
  let accountId: string;

  beforeEach(async () => {
    database = new PGlite();
    await applyMigration(database, '0000_foundation.sql');
    await applyMigration(database, '0001_generation_trace.sql');
    await applyMigration(database, '0003_account_profiles.sql');
    const account = await database.query<{ id: string }>(`
      INSERT INTO accounts (owner_user_id, name)
      SELECT id, '示例账号' FROM local_users RETURNING id
    `);
    accountId = account.rows[0]?.id ?? '';
  });

  afterEach(async () => {
    await database.close();
  });

  it('allows only one active profile per account', async () => {
    await database.exec(`
      INSERT INTO account_profile_versions (
        account_id, version_number, status, positioning_statement,
        target_audience, value_proposition, activated_at
      ) VALUES (
        '${accountId}', 1, 'active', '帮助个人创作者稳定写作',
        '个人公众号创作者', '可执行的内容方法', now()
      )
    `);

    await expect(
      database.exec(`
        INSERT INTO account_profile_versions (
          account_id, version_number, status, positioning_statement,
          target_audience, value_proposition, activated_at
        ) VALUES (
          '${accountId}', 2, 'active', '第二定位', '目标读者', '第二价值', now()
        )
      `),
    ).rejects.toThrow();
  });

  it('keeps accepted profile content immutable while allowing historical transition', async () => {
    const profile = await database.query<{ id: string }>(`
      INSERT INTO account_profile_versions (
        account_id, version_number, status, positioning_statement,
        target_audience, value_proposition, activated_at
      ) VALUES (
        '${accountId}', 1, 'active', '稳定定位', '个人创作者', '写作方法', now()
      ) RETURNING id
    `);
    const profileId = profile.rows[0]?.id ?? '';

    await expect(
      database.exec(`
        UPDATE account_profile_versions SET positioning_statement = '覆盖定位'
        WHERE id = '${profileId}'
      `),
    ).rejects.toThrow('immutable');
    await expect(
      database.exec(`
        UPDATE account_profile_versions
        SET status = 'historical', superseded_at = now()
        WHERE id = '${profileId}'
      `),
    ).resolves.not.toThrow();
  });

  it('blocks activation until the three core positioning fields are complete', async () => {
    const profile = await database.query<{ id: string }>(`
      INSERT INTO account_profile_versions (account_id, version_number)
      VALUES ('${accountId}', 1) RETURNING id
    `);
    const profileId = profile.rows[0]?.id ?? '';

    await expect(
      database.exec(`
        UPDATE account_profile_versions
        SET status = 'active', activated_at = now()
        WHERE id = '${profileId}'
      `),
    ).rejects.toThrow('requires positioning');
  });

  it('keeps AI candidate content immutable before acceptance', async () => {
    const generation = await database.query<{ id: string }>(`
      WITH prompt AS (
        INSERT INTO prompts (owner_user_id, capability_key, name)
        SELECT id, 'account.positioning', '定位' FROM local_users RETURNING id
      ), version AS (
        INSERT INTO prompt_versions (prompt_id, version_number, status, body)
        SELECT id, 1, 'active', '定位提示' FROM prompt RETURNING id
      )
      INSERT INTO ai_generations (
        owner_user_id, capability_key, prompt_version_id, provider_key,
        model, input_snapshot, model_snapshot
      )
      SELECT local_users.id, 'account.positioning', version.id, 'mock',
        'mock-writer', '{}', '{}' FROM local_users CROSS JOIN version RETURNING ai_generations.id
    `);
    const generationId = generation.rows[0]?.id ?? '';
    const profile = await database.query<{ id: string }>(`
      INSERT INTO account_profile_versions (
        account_id, version_number, source, source_generation_id,
        positioning_statement, target_audience, value_proposition
      ) VALUES (
        '${accountId}', 1, 'ai', '${generationId}',
        'AI 候选', '个人创作者', '内容方法'
      ) RETURNING id
    `);

    await expect(
      database.exec(`
        UPDATE account_profile_versions SET positioning_statement = '原地修改'
        WHERE id = '${profile.rows[0]?.id ?? ''}'
      `),
    ).rejects.toThrow('immutable');
  });
});
