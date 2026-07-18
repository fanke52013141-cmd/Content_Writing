import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

export async function loadMigrationFiles(directory: URL): Promise<readonly MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z0-9_-]+\.sql$/u.test(name))
    .sort((left, right) => left.localeCompare(right));

  const migrations: MigrationFile[] = [];
  for (const name of names) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    migrations.push({ name, sql, checksum: migrationChecksum(sql) });
  }
  return migrations;
}
