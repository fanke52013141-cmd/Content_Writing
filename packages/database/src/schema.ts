import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const outboxStatus = pgEnum('outbox_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const promptVersionStatus = pgEnum('prompt_version_status', [
  'draft',
  'active',
  'deprecated',
]);

export const generationStatus = pgEnum('generation_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const accountStatus = pgEnum('account_status', ['active', 'inactive', 'archived']);
export const accountProfileStatus = pgEnum('account_profile_status', [
  'draft',
  'active',
  'historical',
]);
export const accountProfileSource = pgEnum('account_profile_source', ['manual', 'ai']);
export const contentObjectType = pgEnum('content_object_type', [
  'project',
  'topic',
  'material',
  'outline',
  'article',
  'review',
  'image_asset',
  'formatted_article',
]);
export const contentObjectStatus = pgEnum('content_object_status', [
  'active',
  'completed',
  'archived',
  'deleted',
]);
export const projectCreationOrigin = pgEnum('project_creation_origin', [
  'hot_topic',
  'topic',
  'idea',
  'existing_article',
  'blank',
]);
export const topicSource = pgEnum('topic_source', ['manual', 'ai', 'hot_topic']);
export const contentRelationType = pgEnum('content_relation_type', [
  'project_has_topic',
  'project_has_material',
  'topic_has_material',
  'project_has_outline',
  'project_has_article',
]);
export const materialKind = pgEnum('material_kind', [
  'plain_text',
  'markdown',
  'docx',
  'pdf',
  'webpage',
]);
export const termsReviewStatus = pgEnum('terms_review_status', [
  'not_applicable',
  'pending',
  'approved',
  'restricted',
]);
export const contentFileRole = pgEnum('content_file_role', ['original', 'raw_snapshot', 'image']);
export const outlineSource = pgEnum('outline_source', ['manual', 'ai']);
export const articleVersionKind = pgEnum('article_version_kind', [
  'manual',
  'ai_candidate',
  'revision_candidate',
]);
export const articleVersionStatus = pgEnum('article_version_status', [
  'current',
  'candidate',
  'superseded',
]);
export const reviewVerdict = pgEnum('review_verdict', ['pass', 'needs_revision', 'blocked']);

export const localUsers = pgTable(
  'local_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    singletonKey: boolean('singleton_key').default(true).notNull(),
    displayName: text('display_name').default('本地创作者').notNull(),
    pinEnabled: boolean('pin_enabled').default(false).notNull(),
    pinHash: text('pin_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('local_users_singleton_key_uq').on(table.singletonKey),
    check('local_users_singleton_true_ck', sql`${table.singletonKey} = true`),
    check(
      'local_users_pin_consistency_ck',
      sql`(${table.pinEnabled} = false AND ${table.pinHash} IS NULL) OR (${table.pinEnabled} = true AND ${table.pinHash} IS NOT NULL)`,
    ),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    idempotencyKey: text('idempotency_key').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id'),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    status: outboxStatus('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (table) => [
    uniqueIndex('outbox_events_idempotency_key_uq').on(table.idempotencyKey),
    index('outbox_events_dispatch_idx').on(table.status, table.availableAt),
    check('outbox_events_attempts_nonnegative_ck', sql`${table.attempts} >= 0`),
  ],
);

export const aiCapabilities = pgTable('ai_capabilities', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const prompts = pgTable(
  'prompts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => localUsers.id, { onDelete: 'restrict' }),
    capabilityKey: text('capability_key')
      .notNull()
      .references(() => aiCapabilities.key, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    safetyBoundary: boolean('safety_boundary').default(false).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('prompts_owner_capability_idx').on(table.ownerUserId, table.capabilityKey)],
);

export const promptVersions = pgTable(
  'prompt_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    promptId: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    status: promptVersionStatus('status').default('draft').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    body: text('body').notNull(),
    inputDefinition: jsonb('input_definition')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    outputDefinition: jsonb('output_definition')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('prompt_versions_prompt_number_uq').on(table.promptId, table.versionNumber),
    uniqueIndex('prompt_versions_single_default_uq')
      .on(table.promptId)
      .where(sql`${table.isDefault} = true`),
    index('prompt_versions_resolution_idx').on(table.promptId, table.status, table.activatedAt),
    check('prompt_versions_number_positive_ck', sql`${table.versionNumber} > 0`),
    check(
      'prompt_versions_default_active_ck',
      sql`${table.isDefault} = false OR ${table.status} = 'active'`,
    ),
  ],
);

export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => localUsers.id, { onDelete: 'restrict' }),
    capabilityKey: text('capability_key')
      .notNull()
      .references(() => aiCapabilities.key, { onDelete: 'restrict' }),
    promptVersionId: uuid('prompt_version_id')
      .notNull()
      .references(() => promptVersions.id, { onDelete: 'restrict' }),
    providerKey: text('provider_key').notNull(),
    model: text('model').notNull(),
    inputSnapshot: jsonb('input_snapshot').$type<Record<string, unknown>>().notNull(),
    modelSnapshot: jsonb('model_snapshot').$type<Record<string, unknown>>().notNull(),
    status: generationStatus('status').default('queued').notNull(),
    outputText: text('output_text'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('ai_generations_owner_created_idx').on(table.ownerUserId, table.createdAt),
    index('ai_generations_status_created_idx').on(table.status, table.createdAt),
  ],
);

export const generationEvents = pgTable(
  'generation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    generationId: uuid('generation_id')
      .notNull()
      .references(() => aiGenerations.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('generation_events_sequence_uq').on(table.generationId, table.sequence),
    check('generation_events_sequence_nonnegative_ck', sql`${table.sequence} >= 0`),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => localUsers.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description').default('').notNull(),
    status: accountStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    index('accounts_owner_status_idx').on(table.ownerUserId, table.status, table.updatedAt),
    check('accounts_name_nonempty_ck', sql`length(btrim(${table.name})) > 0`),
    check(
      'accounts_archive_consistency_ck',
      sql`(${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL) OR (${table.status} <> 'archived' AND ${table.archivedAt} IS NULL)`,
    ),
  ],
);

export const accountProfileVersions = pgTable(
  'account_profile_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    versionNumber: integer('version_number').notNull(),
    status: accountProfileStatus('status').default('draft').notNull(),
    source: accountProfileSource('source').default('manual').notNull(),
    positioningStatement: text('positioning_statement').default('').notNull(),
    targetAudience: text('target_audience').default('').notNull(),
    valueProposition: text('value_proposition').default('').notNull(),
    contentPillars: text('content_pillars')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    toneKeywords: text('tone_keywords')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    writingStyle: text('writing_style').default('').notNull(),
    contentBoundaries: text('content_boundaries').default('').notNull(),
    versionNote: text('version_note').default('').notNull(),
    sourceGenerationId: uuid('source_generation_id').references(() => aiGenerations.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('account_profile_versions_account_number_uq').on(
      table.accountId,
      table.versionNumber,
    ),
    uniqueIndex('account_profile_versions_single_active_uq')
      .on(table.accountId)
      .where(sql`${table.status} = 'active'`),
    index('account_profile_versions_account_created_idx').on(table.accountId, table.createdAt),
    check('account_profile_versions_number_positive_ck', sql`${table.versionNumber} > 0`),
  ],
);

export const contentObjects = pgTable(
  'content_objects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => localUsers.id, { onDelete: 'restrict' }),
    objectType: contentObjectType('object_type').notNull(),
    status: contentObjectStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('content_objects_id_owner_uq').on(table.id, table.ownerUserId),
    index('content_objects_owner_type_status_idx').on(
      table.ownerUserId,
      table.objectType,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const contentProjects = pgTable(
  'content_projects',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    title: text('title').notNull(),
    creationOrigin: projectCreationOrigin('creation_origin').notNull(),
    originNote: text('origin_note').default('').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('content_projects_id_owner_uq').on(table.id, table.ownerUserId),
    foreignKey({
      columns: [table.id, table.ownerUserId],
      foreignColumns: [contentObjects.id, contentObjects.ownerUserId],
      name: 'content_projects_object_fk',
    }).onDelete('restrict'),
    check('content_projects_title_nonempty_ck', sql`length(btrim(${table.title})) > 0`),
  ],
);

export const projectAccounts = pgTable(
  'project_accounts',
  {
    projectId: uuid('project_id').notNull(),
    accountId: uuid('account_id').notNull(),
    ownerUserId: uuid('owner_user_id').notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.projectId, table.ownerUserId],
      foreignColumns: [contentProjects.id, contentProjects.ownerUserId],
      name: 'project_accounts_project_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.ownerUserId],
      foreignColumns: [accounts.id, accounts.ownerUserId],
      name: 'project_accounts_account_fk',
    }).onDelete('restrict'),
    uniqueIndex('project_accounts_project_account_uq').on(table.projectId, table.accountId),
    uniqueIndex('project_accounts_single_primary_uq')
      .on(table.projectId)
      .where(sql`${table.isPrimary} = true`),
    index('project_accounts_account_idx').on(table.accountId),
  ],
);

export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    accountId: uuid('account_id'),
    title: text('title').notNull(),
    angle: text('angle').default('').notNull(),
    targetAudience: text('target_audience').default('').notNull(),
    contentGoal: text('content_goal').default('').notNull(),
    keywords: text('keywords')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    source: topicSource('source').default('manual').notNull(),
    sourceGenerationId: uuid('source_generation_id').references(() => aiGenerations.id, {
      onDelete: 'restrict',
    }),
  },
  (table) => [
    uniqueIndex('topics_id_owner_uq').on(table.id, table.ownerUserId),
    foreignKey({
      columns: [table.id, table.ownerUserId],
      foreignColumns: [contentObjects.id, contentObjects.ownerUserId],
      name: 'topics_object_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.accountId, table.ownerUserId],
      foreignColumns: [accounts.id, accounts.ownerUserId],
      name: 'topics_account_fk',
    }).onDelete('restrict'),
    index('topics_account_idx').on(table.accountId),
    check('topics_title_nonempty_ck', sql`length(btrim(${table.title})) > 0`),
  ],
);

export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    title: text('title').notNull(),
    kind: materialKind('kind').notNull(),
    sourceText: text('source_text'),
    extractedText: text('extracted_text').notNull(),
    notes: text('notes').default('').notNull(),
    sourceUrl: text('source_url'),
    sourceTitle: text('source_title').default('').notNull(),
    sourceSiteName: text('source_site_name').default('').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    termsReviewStatus: termsReviewStatus('terms_review_status').default('not_applicable').notNull(),
    extractionWarnings: text('extraction_warnings')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('materials_id_owner_uq').on(table.id, table.ownerUserId),
    foreignKey({
      columns: [table.id, table.ownerUserId],
      foreignColumns: [contentObjects.id, contentObjects.ownerUserId],
      name: 'materials_object_fk',
    }).onDelete('restrict'),
    index('materials_kind_idx').on(table.kind),
    check('materials_title_nonempty_ck', sql`length(btrim(${table.title})) > 0`),
    check('materials_text_nonempty_ck', sql`length(btrim(${table.extractedText})) > 0`),
  ],
);

export const outlines = pgTable(
  'outlines',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    projectId: uuid('project_id'),
    topicId: uuid('topic_id'),
    title: text('title').notNull(),
    summary: text('summary').default('').notNull(),
    sections: jsonb('sections')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    source: outlineSource('source').default('manual').notNull(),
    sourceGenerationId: uuid('source_generation_id').references(() => aiGenerations.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('outlines_id_owner_uq').on(table.id, table.ownerUserId),
    foreignKey({
      columns: [table.id, table.ownerUserId],
      foreignColumns: [contentObjects.id, contentObjects.ownerUserId],
      name: 'outlines_object_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId, table.ownerUserId],
      foreignColumns: [contentProjects.id, contentProjects.ownerUserId],
      name: 'outlines_project_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.topicId, table.ownerUserId],
      foreignColumns: [topics.id, topics.ownerUserId],
      name: 'outlines_topic_fk',
    }).onDelete('restrict'),
    index('outlines_owner_updated_idx').on(table.ownerUserId, table.updatedAt),
    check('outlines_title_nonempty_ck', sql`length(btrim(${table.title})) > 0`),
    check('outlines_sections_array_ck', sql`jsonb_typeof(${table.sections}) = 'array'`),
    check(
      'outlines_source_generation_ck',
      sql`(${table.source} = 'ai' AND ${table.sourceGenerationId} IS NOT NULL) OR (${table.source} = 'manual' AND ${table.sourceGenerationId} IS NULL)`,
    ),
  ],
);

export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    projectId: uuid('project_id'),
    topicId: uuid('topic_id'),
    outlineId: uuid('outline_id'),
    title: text('title').notNull(),
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('articles_id_owner_uq').on(table.id, table.ownerUserId),
    foreignKey({
      columns: [table.id, table.ownerUserId],
      foreignColumns: [contentObjects.id, contentObjects.ownerUserId],
      name: 'articles_object_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectId, table.ownerUserId],
      foreignColumns: [contentProjects.id, contentProjects.ownerUserId],
      name: 'articles_project_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.topicId, table.ownerUserId],
      foreignColumns: [topics.id, topics.ownerUserId],
      name: 'articles_topic_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.outlineId, table.ownerUserId],
      foreignColumns: [outlines.id, outlines.ownerUserId],
      name: 'articles_outline_fk',
    }).onDelete('restrict'),
    index('articles_owner_updated_idx').on(table.ownerUserId, table.updatedAt),
    check('articles_title_nonempty_ck', sql`length(btrim(${table.title})) > 0`),
  ],
);

export const articleVersions = pgTable(
  'article_versions',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    articleId: uuid('article_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    kind: articleVersionKind('kind').notNull(),
    status: articleVersionStatus('status').notNull(),
    sourceGenerationId: uuid('source_generation_id').references(() => aiGenerations.id, {
      onDelete: 'restrict',
    }),
    sourceReviewId: uuid('source_review_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.id, table.ownerUserId],
      foreignColumns: [articles.id, articles.ownerUserId],
      name: 'article_versions_article_fk',
    }).onDelete('restrict'),
    uniqueIndex('article_versions_article_number_uq').on(table.articleId, table.versionNumber),
    index('article_versions_article_created_idx').on(table.articleId, table.createdAt),
    check('article_versions_number_positive_ck', sql`${table.versionNumber} > 0`),
    check('article_versions_title_nonempty_ck', sql`length(btrim(${table.title})) > 0`),
    check('article_versions_body_nonempty_ck', sql`length(btrim(${table.body})) > 0`),
    check(
      'article_versions_status_acceptance_ck',
      sql`(${table.status} = 'current' AND ${table.acceptedAt} IS NOT NULL) OR (${table.status} <> 'current')`,
    ),
    uniqueIndex('article_versions_id_owner_uq').on(table.id, table.ownerUserId),
  ],
);

export const articleReviews = pgTable(
  'article_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    articleId: uuid('article_id').notNull(),
    versionId: uuid('version_id').notNull(),
    capabilityKey: text('capability_key').notNull(),
    verdict: reviewVerdict('verdict').notNull(),
    summary: text('summary').notNull(),
    findings: jsonb('findings')
      .default(sql`'[]'::jsonb`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.articleId, table.ownerUserId],
      foreignColumns: [articles.id, articles.ownerUserId],
      name: 'article_reviews_article_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.versionId, table.ownerUserId],
      foreignColumns: [articleVersions.id, articleVersions.ownerUserId],
      name: 'article_reviews_version_fk',
    }).onDelete('restrict'),
    index('article_reviews_article_created_idx').on(table.articleId, table.createdAt),
    check(
      'article_reviews_capability_ck',
      sql`${table.capabilityKey} IN ('review.positioning', 'review.fact-risk', 'review.readability')`,
    ),
    check('article_reviews_summary_nonempty_ck', sql`length(btrim(${table.summary})) > 0`),
    check('article_reviews_findings_array_ck', sql`jsonb_typeof(${table.findings}) = 'array'`),
  ],
);

export const contentFiles = pgTable(
  'content_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    contentObjectId: uuid('content_object_id').notNull(),
    fileRole: contentFileRole('file_role').notNull(),
    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').default('').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.contentObjectId, table.ownerUserId],
      foreignColumns: [contentObjects.id, contentObjects.ownerUserId],
      name: 'content_files_object_fk',
    }).onDelete('restrict'),
    uniqueIndex('content_files_storage_key_uq').on(table.storageKey),
    uniqueIndex('content_files_single_source_role_uq')
      .on(table.contentObjectId, table.fileRole)
      .where(sql`${table.fileRole} IN ('original', 'raw_snapshot') AND ${table.deletedAt} IS NULL`),
    index('content_files_expiry_idx')
      .on(table.expiresAt)
      .where(sql`${table.expiresAt} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    check('content_files_size_ck', sql`${table.byteSize} >= 0`),
    check('content_files_sha256_ck', sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const contentRelations = pgTable(
  'content_relations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => localUsers.id, { onDelete: 'restrict' }),
    fromObjectId: uuid('from_object_id').notNull(),
    toObjectId: uuid('to_object_id').notNull(),
    relationType: contentRelationType('relation_type').notNull(),
    projectScopeId: uuid('project_scope_id'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.fromObjectId, table.ownerUserId],
      foreignColumns: [contentObjects.id, contentObjects.ownerUserId],
      name: 'content_relations_from_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.toObjectId, table.ownerUserId],
      foreignColumns: [contentObjects.id, contentObjects.ownerUserId],
      name: 'content_relations_to_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.projectScopeId, table.ownerUserId],
      foreignColumns: [contentProjects.id, contentProjects.ownerUserId],
      name: 'content_relations_project_fk',
    }).onDelete('restrict'),
    uniqueIndex('content_relations_active_uq')
      .on(table.fromObjectId, table.toObjectId, table.relationType)
      .where(sql`${table.endedAt} IS NULL`),
    uniqueIndex('content_relations_single_primary_uq')
      .on(table.fromObjectId, table.relationType)
      .where(sql`${table.endedAt} IS NULL AND ${table.isPrimary} = true`),
    index('content_relations_to_active_idx')
      .on(table.toObjectId, table.relationType)
      .where(sql`${table.endedAt} IS NULL`),
  ],
);

export type LocalUserRecord = typeof localUsers.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
export type PromptVersionRecord = typeof promptVersions.$inferSelect;
export type AiGenerationRecord = typeof aiGenerations.$inferSelect;
export type AccountRecord = typeof accounts.$inferSelect;
export type AccountProfileVersionRecord = typeof accountProfileVersions.$inferSelect;
export type ContentObjectRecord = typeof contentObjects.$inferSelect;
export type ContentProjectRecord = typeof contentProjects.$inferSelect;
export type ProjectAccountRecord = typeof projectAccounts.$inferSelect;
export type TopicRecord = typeof topics.$inferSelect;
export type MaterialRecord = typeof materials.$inferSelect;
export type OutlineRecord = typeof outlines.$inferSelect;
export type ArticleRecord = typeof articles.$inferSelect;
export type ArticleVersionRecord = typeof articleVersions.$inferSelect;
export type ArticleReviewRecord = typeof articleReviews.$inferSelect;
export type ContentFileRecord = typeof contentFiles.$inferSelect;
export type ContentRelationRecord = typeof contentRelations.$inferSelect;
