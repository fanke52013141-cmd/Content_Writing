import {
  boolean,
  check,
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

export type LocalUserRecord = typeof localUsers.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
export type PromptVersionRecord = typeof promptVersions.$inferSelect;
export type AiGenerationRecord = typeof aiGenerations.$inferSelect;
