import { z } from 'zod';

export const modelProviderKindSchema = z.enum([
  'openai_compatible',
  'openrouter',
  'newapi',
  'custom',
]);
export const modelProviderConfigSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  kind: modelProviderKindSchema,
  baseUrl: z.url(),
  model: z.string().min(1).max(200),
  enabled: z.boolean(),
  apiKeySet: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const createModelProviderConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: modelProviderKindSchema,
    baseUrl: z.url(),
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().max(500).optional(),
    enabled: z.boolean().default(false),
  })
  .strict();
export const updateModelProviderConfigSchema = createModelProviderConfigSchema.partial().strict();
export type ModelProviderKind = z.infer<typeof modelProviderKindSchema>;
export type ModelProviderConfig = z.infer<typeof modelProviderConfigSchema>;
export type CreateModelProviderConfig = z.infer<typeof createModelProviderConfigSchema>;
export type UpdateModelProviderConfig = z.infer<typeof updateModelProviderConfigSchema>;
