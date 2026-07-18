import { z } from 'zod';

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum);

export const outlineStatusSchema = z.enum(['active', 'archived']);
export const outlineSourceSchema = z.enum(['manual', 'ai']);

export const outlineSectionSchema = z.object({
  heading: requiredText(240),
  purpose: optionalText(2_000),
  keyPoints: z.array(requiredText(500)).max(30),
  evidenceMaterialIds: z.array(z.uuid()).max(30),
});

export const outlineSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  topicId: z.uuid().nullable(),
  title: requiredText(240),
  summary: optionalText(5_000),
  sections: z.array(outlineSectionSchema).max(50),
  source: outlineSourceSchema,
  sourceGenerationId: z.uuid().nullable(),
  status: outlineStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});

export const createOutlineSchema = z
  .object({
    projectId: z.uuid().optional(),
    topicId: z.uuid().optional(),
    title: requiredText(240),
    summary: optionalText(5_000).default(''),
    sections: z.array(outlineSectionSchema).min(1).max(50),
  })
  .strict();

export const updateOutlineSchema = z
  .object({
    title: requiredText(240).optional(),
    summary: optionalText(5_000).optional(),
    sections: z.array(outlineSectionSchema).min(1).max(50).optional(),
    status: outlineStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one outline field is required.');

export type OutlineStatus = z.infer<typeof outlineStatusSchema>;
export type OutlineSource = z.infer<typeof outlineSourceSchema>;
export type OutlineSection = z.infer<typeof outlineSectionSchema>;
export type Outline = z.infer<typeof outlineSchema>;
export type CreateOutline = z.infer<typeof createOutlineSchema>;
export type UpdateOutline = z.infer<typeof updateOutlineSchema>;
