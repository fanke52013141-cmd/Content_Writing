CREATE TYPE "outline_source" AS ENUM ('manual', 'ai');

CREATE TABLE "outlines" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "project_id" uuid,
  "topic_id" uuid,
  "title" text NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source" "outline_source" DEFAULT 'manual' NOT NULL,
  "source_generation_id" uuid REFERENCES "ai_generations"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "outlines_object_fk" FOREIGN KEY ("id", "owner_user_id")
    REFERENCES "content_objects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "outlines_project_fk" FOREIGN KEY ("project_id", "owner_user_id")
    REFERENCES "content_projects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "outlines_topic_fk" FOREIGN KEY ("topic_id", "owner_user_id")
    REFERENCES "topics" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "outlines_title_nonempty_ck" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "outlines_sections_array_ck" CHECK (jsonb_typeof("sections") = 'array'),
  CONSTRAINT "outlines_source_generation_ck" CHECK (
    ("source" = 'ai' AND "source_generation_id" IS NOT NULL)
    OR ("source" = 'manual' AND "source_generation_id" IS NULL)
  )
);
CREATE UNIQUE INDEX "outlines_id_owner_uq" ON "outlines" ("id", "owner_user_id");
CREATE INDEX "outlines_owner_updated_idx" ON "outlines" ("owner_user_id", "updated_at");

CREATE OR REPLACE FUNCTION enforce_outline_object_rules()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM content_objects
    WHERE id = NEW.id AND owner_user_id = NEW.owner_user_id AND object_type = 'outline'
  ) THEN
    RAISE EXCEPTION 'outline requires an outline content object';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "outlines_object_rules_trg"
BEFORE INSERT OR UPDATE ON "outlines"
FOR EACH ROW EXECUTE FUNCTION enforce_outline_object_rules();
