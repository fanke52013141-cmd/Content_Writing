CREATE TYPE "prompt_version_status" AS ENUM ('draft', 'active', 'deprecated');
CREATE TYPE "generation_status" AS ENUM (
  'queued', 'running', 'succeeded', 'failed', 'cancelled'
);

CREATE TABLE "ai_capabilities" (
  "key" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "prompts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "local_users"("id") ON DELETE RESTRICT,
  "capability_key" text NOT NULL REFERENCES "ai_capabilities"("key") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "safety_boundary" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "prompts_owner_capability_idx" ON "prompts" ("owner_user_id", "capability_key");

CREATE TABLE "prompt_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "prompt_id" uuid NOT NULL REFERENCES "prompts"("id") ON DELETE RESTRICT,
  "version_number" integer NOT NULL,
  "status" "prompt_version_status" DEFAULT 'draft' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "body" text NOT NULL,
  "input_definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output_definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone,
  "deprecated_at" timestamp with time zone,
  CONSTRAINT "prompt_versions_number_positive_ck" CHECK ("version_number" > 0),
  CONSTRAINT "prompt_versions_default_active_ck" CHECK (
    "is_default" = false OR "status" = 'active'
  )
);
CREATE UNIQUE INDEX "prompt_versions_prompt_number_uq"
  ON "prompt_versions" ("prompt_id", "version_number");
CREATE UNIQUE INDEX "prompt_versions_single_default_uq"
  ON "prompt_versions" ("prompt_id") WHERE "is_default" = true;
CREATE INDEX "prompt_versions_resolution_idx"
  ON "prompt_versions" ("prompt_id", "status", "activated_at");

CREATE TABLE "ai_generations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "local_users"("id") ON DELETE RESTRICT,
  "capability_key" text NOT NULL REFERENCES "ai_capabilities"("key") ON DELETE RESTRICT,
  "prompt_version_id" uuid NOT NULL REFERENCES "prompt_versions"("id") ON DELETE RESTRICT,
  "provider_key" text NOT NULL,
  "model" text NOT NULL,
  "input_snapshot" jsonb NOT NULL,
  "model_snapshot" jsonb NOT NULL,
  "status" "generation_status" DEFAULT 'queued' NOT NULL,
  "output_text" text,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);
CREATE INDEX "ai_generations_owner_created_idx"
  ON "ai_generations" ("owner_user_id", "created_at");
CREATE INDEX "ai_generations_status_created_idx"
  ON "ai_generations" ("status", "created_at");

CREATE TABLE "generation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "generation_id" uuid NOT NULL REFERENCES "ai_generations"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "generation_events_sequence_nonnegative_ck" CHECK ("sequence" >= 0)
);
CREATE UNIQUE INDEX "generation_events_sequence_uq"
  ON "generation_events" ("generation_id", "sequence");

CREATE OR REPLACE FUNCTION prevent_active_prompt_content_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('active', 'deprecated') AND (
    NEW.prompt_id IS DISTINCT FROM OLD.prompt_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.input_definition IS DISTINCT FROM OLD.input_definition
    OR NEW.output_definition IS DISTINCT FROM OLD.output_definition
  ) THEN
    RAISE EXCEPTION 'Active or deprecated prompt version content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "prompt_versions_immutable_content_trg"
BEFORE UPDATE ON "prompt_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_active_prompt_content_change();

CREATE OR REPLACE FUNCTION prevent_generation_snapshot_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.capability_key IS DISTINCT FROM OLD.capability_key
    OR NEW.prompt_version_id IS DISTINCT FROM OLD.prompt_version_id
    OR NEW.provider_key IS DISTINCT FROM OLD.provider_key
    OR NEW.model IS DISTINCT FROM OLD.model
    OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
    OR NEW.model_snapshot IS DISTINCT FROM OLD.model_snapshot
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Generation trace snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ai_generations_immutable_snapshot_trg"
BEFORE UPDATE ON "ai_generations"
FOR EACH ROW EXECUTE FUNCTION prevent_generation_snapshot_change();

INSERT INTO "ai_capabilities" ("key", "name", "description") VALUES
  ('account.positioning', '账号定位', '创建或优化账号定位候选'),
  ('topic.hot-filter', '热点筛选', '根据账号定位筛选热点'),
  ('research.plan', '研究计划', '为选题生成研究计划'),
  ('material.process', '素材处理', '整理素材与证据'),
  ('outline.write', '框架写作', '生成文章框架候选'),
  ('article.write', '正文写作', '生成文章候选版本'),
  ('review.positioning', '定位与表达评审', '检查账号定位与表达一致性'),
  ('review.fact-risk', '事实引用风险评审', '检查事实、引用和风险'),
  ('review.readability', '可读性传播力评审', '检查公众号可读性与传播力'),
  ('article.revise', '定向改写', '根据选中评审生成改写候选');
