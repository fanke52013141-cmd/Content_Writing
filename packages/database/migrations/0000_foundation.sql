CREATE TYPE "outbox_status" AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE "local_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "singleton_key" boolean DEFAULT true NOT NULL,
  "display_name" text DEFAULT '本地创作者' NOT NULL,
  "pin_enabled" boolean DEFAULT false NOT NULL,
  "pin_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "local_users_singleton_true_ck" CHECK ("singleton_key" = true),
  CONSTRAINT "local_users_pin_consistency_ck" CHECK (
    ("pin_enabled" = false AND "pin_hash" IS NULL)
    OR ("pin_enabled" = true AND "pin_hash" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "local_users_singleton_key_uq" ON "local_users" ("singleton_key");

CREATE TABLE "outbox_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" text NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_id" uuid,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" "outbox_status" DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "last_error" text,
  CONSTRAINT "outbox_events_attempts_nonnegative_ck" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "outbox_events_idempotency_key_uq"
  ON "outbox_events" ("idempotency_key");
CREATE INDEX "outbox_events_dispatch_idx"
  ON "outbox_events" ("status", "available_at");

INSERT INTO "local_users" ("display_name") VALUES ('本地创作者');
