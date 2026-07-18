import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export function createDatabase(databaseUrl: string) {
  const queryClient = postgres(databaseUrl, {
    max: 10,
    prepare: false,
    transform: { undefined: null },
  });

  return {
    db: drizzle(queryClient, { schema }),
    close: async () => queryClient.end(),
  };
}

export type Database = ReturnType<typeof createDatabase>['db'];
