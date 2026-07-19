import { z } from 'zod';

export const promptCapabilityKeySchema = z.enum([
  'account.positioning',
  'topic.hot-filter',
  'research.plan',
  'material.process',
  'outline.write',
  'article.write',
  'review.positioning',
  'review.fact-risk',
  'review.readability',
  'article.revise',
]);
export const promptVersionStatusSchema = z.enum(['draft', 'active', 'deprecated']);
export const promptVersionSchema = z.object({
  id: z.uuid(),
  promptId: z.uuid(),
  versionNumber: z.number().int().positive(),
  status: promptVersionStatusSchema,
  isDefault: z.boolean(),
  body: z.string().min(1).max(100_000),
  createdAt: z.iso.datetime(),
  activatedAt: z.iso.datetime().nullable(),
});
export const promptSchema = z.object({
  id: z.uuid(),
  capabilityKey: promptCapabilityKeySchema,
  name: z.string().min(1).max(200),
  safetyBoundary: z.boolean(),
  versions: z.array(promptVersionSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const createPromptSchema = z
  .object({
    capabilityKey: promptCapabilityKeySchema,
    name: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(100_000),
    safetyBoundary: z.boolean().default(false),
  })
  .strict();
export const createPromptVersionSchema = z
  .object({ body: z.string().trim().min(1).max(100_000) })
  .strict();
export const activatePromptVersionSchema = z
  .object({ isDefault: z.boolean().default(false) })
  .strict();
export type PromptCapabilityKey = z.infer<typeof promptCapabilityKeySchema>;
export type PromptVersion = z.infer<typeof promptVersionSchema>;
export type Prompt = z.infer<typeof promptSchema>;
export type CreatePrompt = z.infer<typeof createPromptSchema>;
export type CreatePromptVersion = z.infer<typeof createPromptVersionSchema>;
export type ActivatePromptVersion = z.infer<typeof activatePromptVersionSchema>;
