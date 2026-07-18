import { z } from 'zod';

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum);

export const projectCreationOriginSchema = z.enum([
  'hot_topic',
  'topic',
  'idea',
  'existing_article',
  'blank',
]);
export const projectStatusSchema = z.enum(['active', 'completed', 'archived']);

export const projectAccountLinkSchema = z.object({
  accountId: z.uuid(),
  accountName: requiredText(80),
  isPrimary: z.boolean(),
});

export const contentProjectSchema = z.object({
  id: z.uuid(),
  title: requiredText(200),
  creationOrigin: projectCreationOriginSchema,
  originNote: optionalText(4000),
  status: projectStatusSchema,
  accountLinks: z.array(projectAccountLinkSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
});

export const createContentProjectSchema = z
  .object({
    title: requiredText(200),
    creationOrigin: projectCreationOriginSchema,
    originNote: optionalText(4000).default(''),
    primaryAccountId: z.uuid().optional(),
  })
  .strict();

export const updateContentProjectSchema = z
  .object({
    title: requiredText(200).optional(),
    originNote: optionalText(4000).optional(),
    status: projectStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one project field is required.');

export const linkProjectAccountSchema = z
  .object({
    accountId: z.uuid(),
    isPrimary: z.boolean().default(false),
  })
  .strict();

export type ProjectCreationOrigin = z.infer<typeof projectCreationOriginSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type ProjectAccountLink = z.infer<typeof projectAccountLinkSchema>;
export type ContentProject = z.infer<typeof contentProjectSchema>;
export type CreateContentProject = z.infer<typeof createContentProjectSchema>;
export type UpdateContentProject = z.infer<typeof updateContentProjectSchema>;
export type LinkProjectAccount = z.infer<typeof linkProjectAccountSchema>;
