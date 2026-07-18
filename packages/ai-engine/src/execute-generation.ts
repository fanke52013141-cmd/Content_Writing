import { modelRequestSchema } from '@content-writing/contracts';
import type { ModelEvent, ModelRequest } from '@content-writing/contracts';

import type { ProviderRegistry } from './provider-registry.js';

export interface GenerationExecutionResult {
  events: readonly ModelEvent[];
  output: string;
}

export async function executeGeneration(
  registry: ProviderRegistry,
  providerKey: string,
  untrustedRequest: unknown,
): Promise<GenerationExecutionResult> {
  const request: ModelRequest = modelRequestSchema.parse(untrustedRequest);
  const provider = registry.get(providerKey);
  const events: ModelEvent[] = [];
  let output = '';
  let terminalEventSeen = false;

  for await (const event of provider.generate(request)) {
    if (terminalEventSeen) {
      throw new Error('Provider emitted an event after a terminal event.');
    }
    events.push(event);
    if (event.type === 'delta') output += event.text;
    if (event.type === 'completed' || event.type === 'failed') terminalEventSeen = true;
  }

  if (!terminalEventSeen) throw new Error('Provider stream ended without a terminal event.');
  return { events, output };
}
