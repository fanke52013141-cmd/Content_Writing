import { z } from 'zod';

export const hotTopicSourceSchema = z.enum([
  'douyin',
  'kuaishou',
  'weibo',
  'zhihu',
  'baidu',
  'toutiao',
  'thepaper',
  '36kr',
  'huxiu',
  'bilibili',
]);

export type HotTopicSource = z.infer<typeof hotTopicSourceSchema>;

export const externalSourceKindSchema = z.enum(['hot_topic', 'search']);
export const externalTermsReviewStatusSchema = z.enum(['pending', 'approved', 'restricted']);

export const externalSourcePolicySchema = z.object({
  id: z.uuid(),
  kind: externalSourceKindSchema,
  sourceKey: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(120),
  referenceUrl: z.url(),
  enabled: z.boolean(),
  termsReviewStatus: externalTermsReviewStatusSchema,
  reviewNote: z.string().max(2000),
  reviewedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const updateExternalSourcePolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    termsReviewStatus: externalTermsReviewStatusSchema.optional(),
    reviewNote: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one policy field is required.');

export const hotTopicProviderItemSchema = z.object({
  externalId: z.string().min(1),
  source: hotTopicSourceSchema,
  title: z.string().min(1),
  url: z.url(),
  description: z.string().optional(),
  popularity: z.number().nonnegative().optional(),
  observedAt: z.iso.datetime(),
});

export type HotTopicProviderItem = z.infer<typeof hotTopicProviderItemSchema>;

export interface HotTopicProvider {
  readonly key: string;
  list(source: HotTopicSource, limit: number): Promise<readonly HotTopicProviderItem[]>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

export const hotTopicItemSchema = hotTopicProviderItemSchema.extend({
  id: z.uuid(),
  rank: z.number().int().positive(),
  providerKey: z.string().min(1),
  fetchedAt: z.iso.datetime(),
});

export const hotTopicQuerySchema = z.object({
  source: hotTopicSourceSchema,
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const hotTopicHistoryQuerySchema = z.object({
  source: hotTopicSourceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const hotTopicToTopicSchema = z
  .object({
    accountId: z.uuid().optional(),
    angle: z.string().trim().max(4000).default(''),
    targetAudience: z.string().trim().max(2000).default(''),
    contentGoal: z.string().trim().max(2000).default(''),
    keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  })
  .strict();

export const externalSearchProviderItemSchema = z.object({
  title: z.string().trim().min(1),
  url: z.url(),
  snippet: z.string().default(''),
  domain: z.string().trim().min(1),
  publishedAt: z.iso.datetime().nullable().default(null),
});

export const externalSearchInputSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().min(1).max(30).default(10),
  })
  .strict();

export const externalSearchResultSchema = externalSearchProviderItemSchema.extend({
  id: z.uuid(),
  rank: z.number().int().positive(),
});

export const externalSearchRunSchema = z.object({
  id: z.uuid(),
  query: z.string().min(1),
  providerKey: z.string().min(1),
  results: z.array(externalSearchResultSchema),
  createdAt: z.iso.datetime(),
});

export interface ExternalSearchProvider {
  readonly key: string;
  search(query: string, limit: number): Promise<readonly ExternalSearchProviderItem[]>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

export type ExternalSourceKind = z.infer<typeof externalSourceKindSchema>;
export type ExternalTermsReviewStatus = z.infer<typeof externalTermsReviewStatusSchema>;
export type ExternalSourcePolicy = z.infer<typeof externalSourcePolicySchema>;
export type UpdateExternalSourcePolicy = z.infer<typeof updateExternalSourcePolicySchema>;
export type HotTopicItem = z.infer<typeof hotTopicItemSchema>;
export type HotTopicToTopic = z.infer<typeof hotTopicToTopicSchema>;
export type ExternalSearchProviderItem = z.infer<typeof externalSearchProviderItemSchema>;
export type ExternalSearchInput = z.infer<typeof externalSearchInputSchema>;
export type ExternalSearchResult = z.infer<typeof externalSearchResultSchema>;
export type ExternalSearchRun = z.infer<typeof externalSearchRunSchema>;
