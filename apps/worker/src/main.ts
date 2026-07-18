import { createServer } from 'node:http';

import { MockTextModelProvider, ProviderRegistry } from '@content-writing/ai-engine';
import {
  AI_GENERATION_QUEUE,
  generationJobSchema,
  type GenerationJob,
} from '@content-writing/contracts';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { loadWorkerEnvironment } from './environment.js';
import { PostgresGenerationTraceWriter } from './generation-trace-writer.js';
import {
  BullGenerationQueuePublisher,
  OutboxDispatcher,
  PostgresOutboxRepository,
} from './outbox-dispatcher.js';
import { processGenerationJob } from './process-generation-job.js';

function bootstrap(): void {
  const environment = loadWorkerEnvironment();
  const connection = new Redis(environment.REDIS_URL, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
  });
  const writer = new PostgresGenerationTraceWriter(environment.DATABASE_URL);
  const registry = new ProviderRegistry();
  registry.register(new MockTextModelProvider());
  const queue = new Queue<GenerationJob>(AI_GENERATION_QUEUE, { connection });
  const outboxRepository = new PostgresOutboxRepository(environment.DATABASE_URL);
  const dispatcher = new OutboxDispatcher(
    outboxRepository,
    new BullGenerationQueuePublisher(queue),
  );

  const worker = new Worker(
    AI_GENERATION_QUEUE,
    async (bullJob) => {
      const job = generationJobSchema.parse(bullJob.data);
      return processGenerationJob(job, registry, writer);
    },
    { connection, concurrency: environment.WORKER_CONCURRENCY },
  );

  const healthServer = createServer((_request, response) => {
    const healthy = connection.status === 'ready' && worker.isRunning();
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({ service: 'content-writing-worker', status: healthy ? 'ok' : 'starting' }),
    );
  });
  healthServer.listen(environment.WORKER_HEALTH_PORT, environment.WORKER_HEALTH_HOST);
  dispatcher.start();

  const shutdown = async (): Promise<void> => {
    healthServer.close();
    dispatcher.stop();
    await worker.close();
    await queue.close();
    await connection.quit();
    await outboxRepository.close();
    await writer.close();
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

bootstrap();
