import { z } from 'zod';

const workerEnvironmentSchema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  WORKER_HEALTH_HOST: z.ipv4().default('0.0.0.0'),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3200),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  MODEL_ENCRYPTION_KEY: z.string().min(16),
});

export function loadWorkerEnvironment(source: NodeJS.ProcessEnv = process.env) {
  return workerEnvironmentSchema.parse(source);
}
