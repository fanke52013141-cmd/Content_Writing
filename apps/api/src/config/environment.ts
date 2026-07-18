import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.ipv4().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  APP_VERSION: z.string().min(1).default('0.1.0'),
  DATABASE_URL: z.url().optional(),
  STORAGE_ROOT: z.string().min(1).default('data/storage'),
});

export interface AppEnvironment {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  version: string;
  databaseUrl?: string;
  storageRoot: string;
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const parsed = environmentSchema.parse(source);

  const environment: AppEnvironment = {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    version: parsed.APP_VERSION,
    storageRoot: parsed.STORAGE_ROOT,
  };
  if (parsed.DATABASE_URL) environment.databaseUrl = parsed.DATABASE_URL;
  return environment;
}
