import { z } from 'zod';

const trimmedText = (maximum: number) => z.string().trim().max(maximum);
const requiredTrimmedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const keywordList = z.array(requiredTrimmedText(80)).max(12).default([]);

export const accountStatusSchema = z.enum(['active', 'inactive', 'archived']);

export const accountSchema = z.object({
  id: z.uuid(),
  name: requiredTrimmedText(80),
  description: trimmedText(1000),
  status: accountStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});

export const createAccountSchema = z
  .object({
    name: requiredTrimmedText(80),
    description: trimmedText(1000).default(''),
  })
  .strict();

export const updateAccountSchema = z
  .object({
    name: requiredTrimmedText(80).optional(),
    description: trimmedText(1000).optional(),
    status: accountStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one account field is required.');

export const accountProfileStatusSchema = z.enum(['draft', 'active', 'historical']);
export const accountProfileSourceSchema = z.enum(['manual', 'ai']);

export const accountProfileContentSchema = z.object({
  positioningStatement: trimmedText(2000),
  targetAudience: trimmedText(2000),
  valueProposition: trimmedText(2000),
  contentPillars: keywordList,
  toneKeywords: keywordList,
  writingStyle: trimmedText(4000),
  contentBoundaries: trimmedText(4000),
});

export const createAccountProfileDraftSchema = accountProfileContentSchema
  .extend({ versionNote: trimmedText(500).default('') })
  .strict();

export const accountProfileVersionSchema = accountProfileContentSchema.extend({
  id: z.uuid(),
  accountId: z.uuid(),
  versionNumber: z.number().int().positive(),
  status: accountProfileStatusSchema,
  source: accountProfileSourceSchema,
  versionNote: trimmedText(500),
  sourceGenerationId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  activatedAt: z.iso.datetime().nullable(),
  supersededAt: z.iso.datetime().nullable(),
});

export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type Account = z.infer<typeof accountSchema>;
export type CreateAccount = z.infer<typeof createAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type AccountProfileStatus = z.infer<typeof accountProfileStatusSchema>;
export type AccountProfileSource = z.infer<typeof accountProfileSourceSchema>;
export type AccountProfileContent = z.infer<typeof accountProfileContentSchema>;
export type CreateAccountProfileDraft = z.infer<typeof createAccountProfileDraftSchema>;
export type AccountProfileVersion = z.infer<typeof accountProfileVersionSchema>;
