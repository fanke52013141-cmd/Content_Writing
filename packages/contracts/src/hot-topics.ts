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
