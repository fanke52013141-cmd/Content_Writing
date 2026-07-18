import { z } from 'zod';

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum);

export const materialStatusSchema = z.enum(['active', 'archived']);
export const materialKindSchema = z.enum(['plain_text', 'markdown', 'docx', 'pdf', 'webpage']);
export const termsReviewStatusSchema = z.enum([
  'not_applicable',
  'pending',
  'approved',
  'restricted',
]);

export const materialProjectLinkSchema = z.object({
  projectId: z.uuid(),
  projectTitle: requiredText(200),
});

export const materialTopicLinkSchema = z.object({
  topicId: z.uuid(),
  topicTitle: requiredText(240),
});

export const materialSchema = z.object({
  id: z.uuid(),
  title: requiredText(240),
  kind: materialKindSchema,
  extractedText: requiredText(1_000_000),
  notes: optionalText(20_000),
  sourceUrl: z.url().nullable(),
  sourceTitle: optionalText(500),
  sourceSiteName: optionalText(240),
  fetchedAt: z.iso.datetime().nullable(),
  termsReviewStatus: termsReviewStatusSchema,
  originalFilename: optionalText(255),
  mimeType: optionalText(160),
  byteSize: z.number().int().nonnegative().nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  fileAvailable: z.boolean(),
  rawSnapshotExpiresAt: z.iso.datetime().nullable(),
  extractionWarnings: z.array(requiredText(500)).max(50),
  status: materialStatusSchema,
  projectLinks: z.array(materialProjectLinkSchema),
  topicLinks: z.array(materialTopicLinkSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});

export const createTextMaterialSchema = z
  .object({
    title: requiredText(240),
    kind: z.enum(['plain_text', 'markdown']),
    content: requiredText(1_000_000),
    notes: optionalText(20_000).default(''),
  })
  .strict();

export const createUrlMaterialSchema = z
  .object({
    url: z.url().refine((value) => /^https?:\/\//u.test(value), 'Only HTTP(S) URLs are supported.'),
    title: optionalText(240).optional(),
    notes: optionalText(20_000).default(''),
  })
  .strict();

export const updateMaterialSchema = z
  .object({
    title: requiredText(240).optional(),
    notes: optionalText(20_000).optional(),
    termsReviewStatus: z.enum(['pending', 'approved', 'restricted']).optional(),
    status: materialStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one material field is required.');

export type MaterialStatus = z.infer<typeof materialStatusSchema>;
export type MaterialKind = z.infer<typeof materialKindSchema>;
export type TermsReviewStatus = z.infer<typeof termsReviewStatusSchema>;
export type MaterialProjectLink = z.infer<typeof materialProjectLinkSchema>;
export type MaterialTopicLink = z.infer<typeof materialTopicLinkSchema>;
export type Material = z.infer<typeof materialSchema>;
export type CreateTextMaterial = z.infer<typeof createTextMaterialSchema>;
export type CreateUrlMaterial = z.infer<typeof createUrlMaterialSchema>;
export type UpdateMaterial = z.infer<typeof updateMaterialSchema>;
