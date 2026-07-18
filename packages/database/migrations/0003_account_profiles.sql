CREATE TYPE "account_status" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "account_profile_status" AS ENUM ('draft', 'active', 'historical');
CREATE TYPE "account_profile_source" AS ENUM ('manual', 'ai');

CREATE TABLE "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "local_users"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "status" "account_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "accounts_name_nonempty_ck" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "accounts_archive_consistency_ck" CHECK (
    ("status" = 'archived' AND "archived_at" IS NOT NULL)
    OR ("status" <> 'archived' AND "archived_at" IS NULL)
  )
);
CREATE INDEX "accounts_owner_status_idx" ON "accounts" ("owner_user_id", "status", "updated_at");

CREATE TABLE "account_profile_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "version_number" integer NOT NULL,
  "status" "account_profile_status" DEFAULT 'draft' NOT NULL,
  "source" "account_profile_source" DEFAULT 'manual' NOT NULL,
  "positioning_statement" text DEFAULT '' NOT NULL,
  "target_audience" text DEFAULT '' NOT NULL,
  "value_proposition" text DEFAULT '' NOT NULL,
  "content_pillars" text[] DEFAULT '{}'::text[] NOT NULL,
  "tone_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
  "writing_style" text DEFAULT '' NOT NULL,
  "content_boundaries" text DEFAULT '' NOT NULL,
  "version_note" text DEFAULT '' NOT NULL,
  "source_generation_id" uuid REFERENCES "ai_generations"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone,
  "superseded_at" timestamp with time zone,
  CONSTRAINT "account_profile_versions_number_positive_ck" CHECK ("version_number" > 0),
  CONSTRAINT "account_profile_versions_source_ck" CHECK (
    ("source" = 'manual' AND "source_generation_id" IS NULL)
    OR ("source" = 'ai' AND "source_generation_id" IS NOT NULL)
  ),
  CONSTRAINT "account_profile_versions_lifecycle_ck" CHECK (
    ("status" = 'draft' AND "activated_at" IS NULL AND "superseded_at" IS NULL)
    OR ("status" = 'active' AND "activated_at" IS NOT NULL AND "superseded_at" IS NULL)
    OR ("status" = 'historical' AND "activated_at" IS NOT NULL AND "superseded_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "account_profile_versions_account_number_uq"
  ON "account_profile_versions" ("account_id", "version_number");
CREATE UNIQUE INDEX "account_profile_versions_single_active_uq"
  ON "account_profile_versions" ("account_id") WHERE "status" = 'active';
CREATE INDEX "account_profile_versions_account_created_idx"
  ON "account_profile_versions" ("account_id", "created_at");

CREATE OR REPLACE FUNCTION enforce_account_profile_version_rules()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'draft account profile can only stay draft or become active';
  END IF;
  IF OLD.status = 'active' AND NEW.status NOT IN ('active', 'historical') THEN
    RAISE EXCEPTION 'active account profile can only stay active or become historical';
  END IF;
  IF OLD.status = 'historical' AND NEW.status <> 'historical' THEN
    RAISE EXCEPTION 'historical account profile is immutable';
  END IF;

  IF OLD.status <> 'draft' OR OLD.source = 'ai' THEN
    IF NEW.positioning_statement IS DISTINCT FROM OLD.positioning_statement
      OR NEW.target_audience IS DISTINCT FROM OLD.target_audience
      OR NEW.value_proposition IS DISTINCT FROM OLD.value_proposition
      OR NEW.content_pillars IS DISTINCT FROM OLD.content_pillars
      OR NEW.tone_keywords IS DISTINCT FROM OLD.tone_keywords
      OR NEW.writing_style IS DISTINCT FROM OLD.writing_style
      OR NEW.content_boundaries IS DISTINCT FROM OLD.content_boundaries
      OR NEW.version_note IS DISTINCT FROM OLD.version_note
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.source_generation_id IS DISTINCT FROM OLD.source_generation_id THEN
      RAISE EXCEPTION 'accepted and AI candidate account profile content is immutable';
    END IF;
  END IF;

  IF NEW.status = 'active' AND (
    length(btrim(NEW.positioning_statement)) = 0
    OR length(btrim(NEW.target_audience)) = 0
    OR length(btrim(NEW.value_proposition)) = 0
  ) THEN
    RAISE EXCEPTION 'active account profile requires positioning, audience and value proposition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "account_profile_versions_rules_trg"
BEFORE UPDATE ON "account_profile_versions"
FOR EACH ROW EXECUTE FUNCTION enforce_account_profile_version_rules();
