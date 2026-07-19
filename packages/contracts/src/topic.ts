import { z } from 'zod';

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum);

export const topicStatusSchema = z.enum(['active', 'archived']);
export const topicSourceSchema = z.enum(['manual', 'ai', 'hot_topic']);

export const topicProjectLinkSchema = z.object({
  projectId: z.uuid(),
  projectTitle: requiredText(200),
  isPrimary: z.boolean(),
});

export const topicSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid().nullable(),
  title: requiredText(240),
  angle: optionalText(4000),
  targetAudience: optionalText(2000),
  contentGoal: optionalText(2000),
  keywords: z.array(requiredText(80)).max(20),
  source: topicSourceSchema,
  sourceGenerationId: z.uuid().nullable(),
  sourceHotTopicId: z.uuid().nullable(),
  status: topicStatusSchema,
  projectLinks: z.array(topicProjectLinkSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});

export const createTopicSchema = z
  .object({
    accountId: z.uuid().optional(),
    title: requiredText(240),
    angle: optionalText(4000).default(''),
    targetAudience: optionalText(2000).default(''),
    contentGoal: optionalText(2000).default(''),
    keywords: z.array(requiredText(80)).max(20).default([]),
  })
  .strict();

export const updateTopicSchema = z
  .object({
    accountId: z.uuid().nullable().optional(),
    title: requiredText(240).optional(),
    angle: optionalText(4000).optional(),
    targetAudience: optionalText(2000).optional(),
    contentGoal: optionalText(2000).optional(),
    keywords: z.array(requiredText(80)).max(20).optional(),
    status: topicStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one topic field is required.');

export const linkTopicProjectSchema = z.object({ isPrimary: z.boolean().default(false) }).strict();

export type TopicStatus = z.infer<typeof topicStatusSchema>;
export type TopicSource = z.infer<typeof topicSourceSchema>;
export type TopicProjectLink = z.infer<typeof topicProjectLinkSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type CreateTopic = z.infer<typeof createTopicSchema>;
export type UpdateTopic = z.infer<typeof updateTopicSchema>;
export type LinkTopicProject = z.infer<typeof linkTopicProjectSchema>;
