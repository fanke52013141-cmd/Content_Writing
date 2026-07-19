import { z } from 'zod';

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum);

export const articleStatusSchema = z.enum(['active', 'archived']);
export const articleVersionKindSchema = z.enum(['manual', 'ai_candidate', 'revision_candidate']);
export const articleVersionStatusSchema = z.enum(['current', 'candidate', 'superseded']);
export const reviewCapabilityKeySchema = z.enum([
  'review.positioning',
  'review.fact-risk',
  'review.readability',
]);
export const reviewVerdictSchema = z.enum(['pass', 'needs_revision', 'blocked']);
export const reviewFindingSeveritySchema = z.enum(['info', 'warning', 'critical']);

export const articleVersionSchema = z.object({
  id: z.uuid(),
  articleId: z.uuid(),
  versionNumber: z.number().int().positive(),
  title: requiredText(240),
  body: requiredText(1_000_000),
  kind: articleVersionKindSchema,
  status: articleVersionStatusSchema,
  sourceGenerationId: z.uuid().nullable(),
  sourceReviewId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
});

export const reviewFindingSchema = z.object({
  severity: reviewFindingSeveritySchema,
  message: requiredText(2_000),
  location: optionalText(240),
});

export const reviewSchema = z.object({
  id: z.uuid(),
  articleId: z.uuid(),
  versionId: z.uuid(),
  capabilityKey: reviewCapabilityKeySchema,
  verdict: reviewVerdictSchema,
  summary: requiredText(5_000),
  findings: z.array(reviewFindingSchema).max(100),
  createdAt: z.iso.datetime(),
});

export const articleSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  topicId: z.uuid().nullable(),
  outlineId: z.uuid().nullable(),
  title: requiredText(240),
  status: articleStatusSchema,
  currentVersionId: z.uuid(),
  currentVersion: articleVersionSchema,
  versions: z.array(articleVersionSchema),
  reviews: z.array(reviewSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});

export const createArticleSchema = z
  .object({
    projectId: z.uuid().optional(),
    topicId: z.uuid().optional(),
    outlineId: z.uuid().optional(),
    title: requiredText(240),
    body: requiredText(1_000_000),
  })
  .strict();

export const createArticleCandidateSchema = z
  .object({
    title: requiredText(240),
    body: requiredText(1_000_000),
    kind: z.enum(['ai_candidate', 'revision_candidate']),
    sourceGenerationId: z.uuid().optional(),
    sourceReviewId: z.uuid().optional(),
  })
  .strict();

export const createReviewSchema = z
  .object({
    versionId: z.uuid(),
    capabilityKey: reviewCapabilityKeySchema,
    verdict: reviewVerdictSchema,
    summary: requiredText(5_000),
    findings: z.array(reviewFindingSchema).max(100),
  })
  .strict();

export const updateArticleSchema = z
  .object({
    status: articleStatusSchema,
  })
  .strict();

export type ArticleStatus = z.infer<typeof articleStatusSchema>;
export type ArticleVersionKind = z.infer<typeof articleVersionKindSchema>;
export type ArticleVersionStatus = z.infer<typeof articleVersionStatusSchema>;
export type ReviewCapabilityKey = z.infer<typeof reviewCapabilityKeySchema>;
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;
export type ArticleVersion = z.infer<typeof articleVersionSchema>;
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Article = z.infer<typeof articleSchema>;
export type CreateArticle = z.infer<typeof createArticleSchema>;
export type CreateArticleCandidate = z.infer<typeof createArticleCandidateSchema>;
export type CreateReview = z.infer<typeof createReviewSchema>;
export type UpdateArticle = z.infer<typeof updateArticleSchema>;
