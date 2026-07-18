import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { loadMigrationFiles, migrationChecksum } from './migration-files.js';

const testDirectory = join(tmpdir(), `content-writing-migrations-${crypto.randomUUID()}`);

afterEach(async () => {
  await rm(testDirectory, { recursive: true, force: true });
});

describe('migration file loader', () => {
  it('loads only numbered SQL migrations in lexical order', async () => {
    await mkdir(testDirectory, { recursive: true });
    await writeFile(join(testDirectory, '0002_second.sql'), 'SELECT 2;', 'utf8');
    await writeFile(join(testDirectory, '0001_first.sql'), 'SELECT 1;', 'utf8');
    await writeFile(join(testDirectory, '0003_multiple_words.sql'), 'SELECT 3;', 'utf8');
    await writeFile(join(testDirectory, 'README.md'), 'ignored', 'utf8');
    const directoryUrl = pathToFileURL(`${testDirectory}/`);

    const migrations = await loadMigrationFiles(directoryUrl);

    expect(migrations.map((migration) => migration.name)).toEqual([
      '0001_first.sql',
      '0002_second.sql',
      '0003_multiple_words.sql',
    ]);
    expect(migrations[0]?.checksum).toBe(migrationChecksum('SELECT 1;'));
  });

  it('changes the checksum whenever migration content changes', () => {
    expect(migrationChecksum('SELECT 1;')).not.toBe(migrationChecksum('SELECT 2;'));
  });

  it('loads every checked-in migration', async () => {
    const migrations = await loadMigrationFiles(new URL('../migrations/', import.meta.url));

    expect(migrations.map((migration) => migration.name)).toEqual([
      '0000_foundation.sql',
      '0001_generation_trace.sql',
      '0002_seed_prompts.sql',
      '0003_account_profiles.sql',
      '0004_content_projects.sql',
      '0005_topics_relations.sql',
    ]);
  });
});
