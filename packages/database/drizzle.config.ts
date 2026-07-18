import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database migration commands.');
}

export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  migrations: { table: 'schema_migrations', schema: 'public' },
  out: './migrations',
  schema: './src/schema.ts',
  strict: true,
  verbose: true,
});
