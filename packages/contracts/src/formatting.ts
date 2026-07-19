import { z } from 'zod';

export const articleFormatThemeSchema = z.enum(['minimal', 'classic_wechat']);
export const articleExportFormatSchema = z.enum(['markdown', 'html']);
export const imageMimeTypeSchema = z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export const articleImageSchema = z.object({
  id: z.uuid(),
  articleId: z.uuid(),
  originalFilename: z.string().min(1).max(255),
  mimeType: imageMimeTypeSchema,
  byteSize: z.number().int().nonnegative(),
  placeholder: z.string().regex(/^\{\{image:[0-9a-f-]{36}\}\}$/u),
  downloadPath: z.string().startsWith('/api/v1/'),
  createdAt: z.iso.datetime(),
});

export const createFormatPreviewSchema = z
  .object({
    versionId: z.uuid().optional(),
    theme: articleFormatThemeSchema.default('minimal'),
  })
  .strict();

export const articleFormatPreviewSchema = z.object({
  articleId: z.uuid(),
  versionId: z.uuid(),
  theme: articleFormatThemeSchema,
  title: z.string().min(1),
  markdown: z.string().min(1),
  html: z.string().min(1),
  copyText: z.string().min(1),
  imagePlaceholders: z.array(z.string()),
});

export const createArticleExportSchema = z
  .object({
    versionId: z.uuid().optional(),
    theme: articleFormatThemeSchema.default('minimal'),
    format: articleExportFormatSchema,
  })
  .strict();

export const articleExportSchema = z.object({
  id: z.uuid(),
  articleId: z.uuid(),
  versionId: z.uuid(),
  theme: articleFormatThemeSchema,
  format: articleExportFormatSchema,
  filename: z.string().min(1).max(255),
  content: z.string().min(1),
  createdAt: z.iso.datetime(),
});

export type ArticleFormatTheme = z.infer<typeof articleFormatThemeSchema>;
export type ArticleExportFormat = z.infer<typeof articleExportFormatSchema>;
export type ArticleImage = z.infer<typeof articleImageSchema>;
export type CreateFormatPreview = z.infer<typeof createFormatPreviewSchema>;
export type ArticleFormatPreview = z.infer<typeof articleFormatPreviewSchema>;
export type CreateArticleExport = z.infer<typeof createArticleExportSchema>;
export type ArticleExport = z.infer<typeof articleExportSchema>;
