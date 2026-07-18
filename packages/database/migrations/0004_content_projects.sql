CREATE TYPE "content_object_type" AS ENUM (
  'project', 'topic', 'material', 'outline', 'article', 'review',
  'image_asset', 'formatted_article'
);
CREATE TYPE "content_object_status" AS ENUM ('active', 'completed', 'archived', 'deleted');
CREATE TYPE "project_creation_origin" AS ENUM (
  'hot_topic', 'topic', 'idea', 'existing_article', 'blank'
);

CREATE UNIQUE INDEX "accounts_id_owner_uq" ON "accounts" ("id", "owner_user_id");

CREATE TABLE "content_objects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "local_users"("id") ON DELETE RESTRICT,
  "object_type" "content_object_type" NOT NULL,
  "status" "content_object_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "content_objects_lifecycle_ck" CHECK (
    ("status" IN ('active', 'completed') AND "archived_at" IS NULL AND "deleted_at" IS NULL)
    OR ("status" = 'archived' AND "archived_at" IS NOT NULL AND "deleted_at" IS NULL)
    OR ("status" = 'deleted' AND "deleted_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "content_objects_id_owner_uq" ON "content_objects" ("id", "owner_user_id");
CREATE INDEX "content_objects_owner_type_status_idx"
  ON "content_objects" ("owner_user_id", "object_type", "status", "updated_at");

CREATE TABLE "content_projects" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "creation_origin" "project_creation_origin" NOT NULL,
  "origin_note" text DEFAULT '' NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "content_projects_object_fk" FOREIGN KEY ("id", "owner_user_id")
    REFERENCES "content_objects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "content_projects_title_nonempty_ck" CHECK (length(btrim("title")) > 0)
);
CREATE UNIQUE INDEX "content_projects_id_owner_uq"
  ON "content_projects" ("id", "owner_user_id");

CREATE TABLE "project_accounts" (
  "project_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("project_id", "account_id"),
  CONSTRAINT "project_accounts_project_fk" FOREIGN KEY ("project_id", "owner_user_id")
    REFERENCES "content_projects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "project_accounts_account_fk" FOREIGN KEY ("account_id", "owner_user_id")
    REFERENCES "accounts" ("id", "owner_user_id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "project_accounts_single_primary_uq"
  ON "project_accounts" ("project_id") WHERE "is_primary" = true;
CREATE INDEX "project_accounts_account_idx" ON "project_accounts" ("account_id");

CREATE OR REPLACE FUNCTION enforce_content_project_object_type()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM content_objects
    WHERE id = NEW.id AND owner_user_id = NEW.owner_user_id AND object_type = 'project'
  ) THEN
    RAISE EXCEPTION 'content project requires a project content object';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "content_projects_object_type_trg"
BEFORE INSERT OR UPDATE ON "content_projects"
FOR EACH ROW EXECUTE FUNCTION enforce_content_project_object_type();
