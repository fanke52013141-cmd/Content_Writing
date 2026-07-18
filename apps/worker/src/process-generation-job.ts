import {
  generationJobSchema,
  type GenerationJob,
  type ModelEvent,
} from '@content-writing/contracts';
import type { ProviderRegistry } from '@content-writing/ai-engine';

import type { GenerationTraceWriter } from './generation-trace-writer.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown worker error';
}

export async function processGenerationJob(
  untrustedJob: unknown,
  registry: ProviderRegistry,
  writer: GenerationTraceWriter,
): Promise<{ output: string }> {
  const job: GenerationJob = generationJobSchema.parse(untrustedJob);
  const provider = registry.get(job.providerKey);
  let output = '';
  let terminalEventSeen = false;
  let failurePersisted = false;
  let sequence = 0;

  await writer.markRunning(job.generationId);

  try {
    for await (const event of provider.generate(job.request)) {
      if (terminalEventSeen) throw new Error('Provider emitted an event after a terminal event.');

      await writer.appendEvent(job.generationId, sequence, event);
      sequence += 1;
      if (event.type === 'delta') output += event.text;

      if (event.type === 'completed') {
        terminalEventSeen = true;
        await writer.markSucceeded(job.generationId, output);
      }

      if (event.type === 'failed') {
        terminalEventSeen = true;
        failurePersisted = true;
        await writer.markFailed(job.generationId, event.code, event.message);
        throw new Error(event.message);
      }
    }

    if (!terminalEventSeen) throw new Error('Provider stream ended without a terminal event.');
    return { output };
  } catch (error) {
    if (!failurePersisted) {
      await writer.markFailed(job.generationId, 'WORKER_EXECUTION_FAILED', errorMessage(error));
    }
    throw error;
  }
}

export function isTerminalEvent(event: ModelEvent): boolean {
  return event.type === 'completed' || event.type === 'failed';
}
