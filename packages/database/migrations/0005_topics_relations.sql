CREATE TYPE "topic_source" AS ENUM ('manual', 'ai', 'hot_topic');
CREATE TYPE "content_relation_type" AS ENUM (
  'project_has_topic', 'project_has_material', 'topic_has_material',
  'project_has_outline', 'project_has_article'
);

CREATE TABLE "topics" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "account_id" uuid,
  "title" text NOT NULL,
  "angle" text DEFAULT '' NOT NULL,
  "target_audience" text DEFAULT '' NOT NULL,
  "content_goal" text DEFAULT '' NOT NULL,
  "keywords" text[] DEFAULT '{}'::text[] NOT NULL,
  "source" "topic_source" DEFAULT 'manual' NOT NULL,
  "source_generation_id" uuid REFERENCES "ai_generations"("id") ON DELETE RESTRICT,
  CONSTRAINT "topics_object_fk" FOREIGN KEY ("id", "owner_user_id")
    REFERENCES "content_objects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "topics_account_fk" FOREIGN KEY ("account_id", "owner_user_id")
    REFERENCES "accounts" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "topics_title_nonempty_ck" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "topics_source_ck" CHECK (
    ("source" = 'ai' AND "source_generation_id" IS NOT NULL)
    OR ("source" <> 'ai' AND "source_generation_id" IS NULL)
  )
);
CREATE UNIQUE INDEX "topics_id_owner_uq" ON "topics" ("id", "owner_user_id");
CREATE INDEX "topics_account_idx" ON "topics" ("account_id");

CREATE TABLE "content_relations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL REFERENCES "local_users"("id") ON DELETE RESTRICT,
  "from_object_id" uuid NOT NULL,
  "to_object_id" uuid NOT NULL,
  "relation_type" "content_relation_type" NOT NULL,
  "project_scope_id" uuid,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone,
  CONSTRAINT "content_relations_from_fk" FOREIGN KEY ("from_object_id", "owner_user_id")
    REFERENCES "content_objects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "content_relations_to_fk" FOREIGN KEY ("to_object_id", "owner_user_id")
    REFERENCES "content_objects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "content_relations_project_fk" FOREIGN KEY ("project_scope_id", "owner_user_id")
    REFERENCES "content_projects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "content_relations_not_self_ck" CHECK ("from_object_id" <> "to_object_id"),
  CONSTRAINT "content_relations_ended_primary_ck" CHECK (
    "ended_at" IS NULL OR "is_primary" = false
  )
);
CREATE UNIQUE INDEX "content_relations_active_uq"
  ON "content_relations" ("from_object_id", "to_object_id", "relation_type")
  WHERE "ended_at" IS NULL;
CREATE UNIQUE INDEX "content_relations_single_primary_uq"
  ON "content_relations" ("from_object_id", "relation_type")
  WHERE "ended_at" IS NULL AND "is_primary" = true;
CREATE INDEX "content_relations_to_active_idx"
  ON "content_relations" ("to_object_id", "relation_type") WHERE "ended_at" IS NULL;

CREATE OR REPLACE FUNCTION enforce_topic_object_rules()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM content_objects
    WHERE id = NEW.id AND owner_user_id = NEW.owner_user_id AND object_type = 'topic'
  ) THEN
    RAISE EXCEPTION 'topic requires a topic content object';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.source = 'ai' AND (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.angle IS DISTINCT FROM OLD.angle
    OR NEW.target_audience IS DISTINCT FROM OLD.target_audience
    OR NEW.content_goal IS DISTINCT FROM OLD.content_goal
    OR NEW.keywords IS DISTINCT FROM OLD.keywords
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
  ) THEN
    RAISE EXCEPTION 'AI topic candidate content is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "topics_object_rules_trg"
BEFORE INSERT OR UPDATE ON "topics"
FOR EACH ROW EXECUTE FUNCTION enforce_topic_object_rules();

CREATE OR REPLACE FUNCTION enforce_content_relation_policy()
RETURNS trigger AS $$
DECLARE
  from_type content_object_type;
  to_type content_object_type;
BEGIN
  SELECT object_type INTO from_type FROM content_objects
    WHERE id = NEW.from_object_id AND owner_user_id = NEW.owner_user_id;
  SELECT object_type INTO to_type FROM content_objects
    WHERE id = NEW.to_object_id AND owner_user_id = NEW.owner_user_id;

  IF NEW.relation_type = 'project_has_topic' AND NOT (
    from_type = 'project' AND to_type = 'topic' AND NEW.project_scope_id = NEW.from_object_id
  ) THEN
    RAISE EXCEPTION 'invalid project_has_topic relation';
  ELSIF NEW.relation_type = 'project_has_material' AND NOT (
    from_type = 'project' AND to_type = 'material' AND NEW.project_scope_id = NEW.from_object_id
  ) THEN
    RAISE EXCEPTION 'invalid project_has_material relation';
  ELSIF NEW.relation_type = 'topic_has_material' AND NOT (
    from_type = 'topic' AND to_type = 'material'
  ) THEN
    RAISE EXCEPTION 'invalid topic_has_material relation';
  ELSIF NEW.relation_type = 'project_has_outline' AND NOT (
    from_type = 'project' AND to_type = 'outline' AND NEW.project_scope_id = NEW.from_object_id
  ) THEN
    RAISE EXCEPTION 'invalid project_has_outline relation';
  ELSIF NEW.relation_type = 'project_has_article' AND NOT (
    from_type = 'project' AND to_type = 'article' AND NEW.project_scope_id = NEW.from_object_id
  ) THEN
    RAISE EXCEPTION 'invalid project_has_article relation';
  END IF;

  IF NEW.is_primary AND NEW.relation_type NOT IN (
    'project_has_topic', 'project_has_outline', 'project_has_article'
  ) THEN
    RAISE EXCEPTION 'relation type does not support primary';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "content_relations_policy_trg"
BEFORE INSERT OR UPDATE ON "content_relations"
FOR EACH ROW EXECUTE FUNCTION enforce_content_relation_policy();
