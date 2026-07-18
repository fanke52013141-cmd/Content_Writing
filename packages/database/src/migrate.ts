import postgres from 'postgres';

import { loadMigrationFiles } from './migration-files.js';

async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const client = postgres(databaseUrl, { max: 1, prepare: false });
  const migrations = await loadMigrationFiles(new URL('../migrations/', import.meta.url));

  try {
    await client`SELECT pg_advisory_lock(hashtext('content-writing-migrations'))`;
    await client`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `;

    for (const migration of migrations) {
      const [existing] = await client<{ checksum: string }[]>`
        SELECT checksum FROM schema_migrations WHERE name = ${migration.name}
      `;
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(`Applied migration checksum mismatch: ${migration.name}`);
        }
        continue;
      }

      await client.begin(async (transaction) => {
        await transaction.unsafe(migration.sql);
        await transaction`
          INSERT INTO schema_migrations (name, checksum)
          VALUES (${migration.name}, ${migration.checksum})
        `;
      });
    }
  } finally {
    try {
      await client`SELECT pg_advisory_unlock(hashtext('content-writing-migrations'))`;
    } finally {
      await client.end();
    }
  }
}

void migrate();
