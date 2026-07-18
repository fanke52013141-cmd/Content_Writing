import { z } from 'zod';

export const generationStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const modelCapabilitiesSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  streaming: z.boolean(),
  structuredOutput: z.boolean(),
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
});

export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;

export const modelRequestSchema = z.object({
  generationId: z.uuid(),
  capabilityKey: z.string().min(1),
  systemPrompt: z.string(),
  userPrompt: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxOutputTokens: z.number().int().positive().max(65536).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type ModelRequest = z.infer<typeof modelRequestSchema>;

export const generationJobSchema = z
  .object({
    generationId: z.uuid(),
    providerKey: z.string().min(1),
    request: modelRequestSchema,
  })
  .strict()
  .refine((job) => job.generationId === job.request.generationId, {
    message: 'Job and model request generation IDs must match.',
    path: ['request', 'generationId'],
  });

export type GenerationJob = z.infer<typeof generationJobSchema>;

export const AI_GENERATION_QUEUE = 'ai-generation';

export const createGenerationSchema = z
  .object({
    capabilityKey: z.string().min(1),
    providerKey: z.string().min(1).default('mock'),
    model: z.string().min(1).default('mock-writer'),
    input: z.record(z.string(), z.unknown()),
    temperature: z.number().min(0).max(2).default(0.7),
    maxOutputTokens: z.number().int().positive().max(65536).optional(),
  })
  .strict();

export type CreateGeneration = z.infer<typeof createGenerationSchema>;

export const generationSchema = z.object({
  id: z.uuid(),
  capabilityKey: z.string().min(1),
  promptVersionId: z.uuid(),
  providerKey: z.string().min(1),
  model: z.string().min(1),
  status: generationStatusSchema,
  outputText: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
});

export type Generation = z.infer<typeof generationSchema>;

export type ModelEvent =
  | { type: 'started'; providerRequestId?: string }
  | { type: 'delta'; text: string }
  | { type: 'completed'; finishReason: string; usage?: ModelUsage }
  | { type: 'failed'; code: string; message: string; retryable: boolean };

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TextModelProvider {
  readonly key: string;
  capabilities(model: string): Promise<ModelCapabilities>;
  generate(request: ModelRequest): AsyncIterable<ModelEvent>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}
