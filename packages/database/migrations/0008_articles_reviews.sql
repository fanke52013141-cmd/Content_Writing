CREATE TYPE "article_version_kind" AS ENUM ('manual', 'ai_candidate', 'revision_candidate');
CREATE TYPE "article_version_status" AS ENUM ('current', 'candidate', 'superseded');
CREATE TYPE "review_verdict" AS ENUM ('pass', 'needs_revision', 'blocked');

CREATE TABLE "articles" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "project_id" uuid,
  "topic_id" uuid,
  "outline_id" uuid,
  "title" text NOT NULL,
  "current_version_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "articles_object_fk" FOREIGN KEY ("id", "owner_user_id")
    REFERENCES "content_objects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "articles_project_fk" FOREIGN KEY ("project_id", "owner_user_id")
    REFERENCES "content_projects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "articles_topic_fk" FOREIGN KEY ("topic_id", "owner_user_id")
    REFERENCES "topics" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "articles_outline_fk" FOREIGN KEY ("outline_id", "owner_user_id")
    REFERENCES "outlines" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "articles_title_nonempty_ck" CHECK (length(btrim("title")) > 0)
);
CREATE UNIQUE INDEX "articles_id_owner_uq" ON "articles" ("id", "owner_user_id");
CREATE INDEX "articles_owner_updated_idx" ON "articles" ("owner_user_id", "updated_at");

CREATE TABLE "article_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "article_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "kind" "article_version_kind" NOT NULL,
  "status" "article_version_status" NOT NULL,
  "source_generation_id" uuid REFERENCES "ai_generations"("id") ON DELETE RESTRICT,
  "source_review_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "accepted_at" timestamp with time zone,
  CONSTRAINT "article_versions_article_fk" FOREIGN KEY ("article_id", "owner_user_id")
    REFERENCES "articles" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "article_versions_number_positive_ck" CHECK ("version_number" > 0),
  CONSTRAINT "article_versions_title_nonempty_ck" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "article_versions_body_nonempty_ck" CHECK (length(btrim("body")) > 0),
  CONSTRAINT "article_versions_status_acceptance_ck" CHECK (
    ("status" = 'current' AND "accepted_at" IS NOT NULL)
    OR ("status" <> 'current')
  )
);
CREATE UNIQUE INDEX "article_versions_article_number_uq"
  ON "article_versions" ("article_id", "version_number");
CREATE UNIQUE INDEX "article_versions_id_owner_uq"
  ON "article_versions" ("id", "owner_user_id");
CREATE INDEX "article_versions_article_created_idx"
  ON "article_versions" ("article_id", "created_at");
ALTER TABLE "articles"
  ADD CONSTRAINT "articles_current_version_fk"
  FOREIGN KEY ("current_version_id", "owner_user_id")
  REFERENCES "article_versions" ("id", "owner_user_id") ON DELETE RESTRICT;

CREATE TABLE "article_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "article_id" uuid NOT NULL,
  "version_id" uuid NOT NULL,
  "capability_key" text NOT NULL,
  "verdict" "review_verdict" NOT NULL,
  "summary" text NOT NULL,
  "findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "article_reviews_article_fk" FOREIGN KEY ("article_id", "owner_user_id")
    REFERENCES "articles" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "article_reviews_version_fk" FOREIGN KEY ("version_id", "owner_user_id")
    REFERENCES "article_versions" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "article_reviews_capability_ck" CHECK (
    "capability_key" IN ('review.positioning', 'review.fact-risk', 'review.readability')
  ),
  CONSTRAINT "article_reviews_summary_nonempty_ck" CHECK (length(btrim("summary")) > 0),
  CONSTRAINT "article_reviews_findings_array_ck" CHECK (jsonb_typeof("findings") = 'array')
);
CREATE INDEX "article_reviews_article_created_idx"
  ON "article_reviews" ("article_id", "created_at");

CREATE OR REPLACE FUNCTION enforce_article_object_rules()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM content_objects
    WHERE id = NEW.id AND owner_user_id = NEW.owner_user_id AND object_type = 'article'
  ) THEN
    RAISE EXCEPTION 'article requires an article content object';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "articles_object_rules_trg"
BEFORE INSERT OR UPDATE ON "articles"
FOR EACH ROW EXECUTE FUNCTION enforce_article_object_rules();

CREATE OR REPLACE FUNCTION prevent_article_version_content_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.article_id IS DISTINCT FROM OLD.article_id
    OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.source_generation_id IS DISTINCT FROM OLD.source_generation_id
    OR NEW.source_review_id IS DISTINCT FROM OLD.source_review_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Article version content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "article_versions_immutable_content_trg"
BEFORE UPDATE ON "article_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_article_version_content_change();
