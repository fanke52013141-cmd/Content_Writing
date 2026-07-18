CREATE TYPE "material_kind" AS ENUM ('plain_text', 'markdown', 'docx', 'pdf', 'webpage');
CREATE TYPE "terms_review_status" AS ENUM (
  'not_applicable', 'pending', 'approved', 'restricted'
);
CREATE TYPE "content_file_role" AS ENUM ('original', 'raw_snapshot', 'image');

CREATE TABLE "materials" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "kind" "material_kind" NOT NULL,
  "source_text" text,
  "extracted_text" text NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "source_url" text,
  "source_title" text DEFAULT '' NOT NULL,
  "source_site_name" text DEFAULT '' NOT NULL,
  "fetched_at" timestamp with time zone,
  "terms_review_status" "terms_review_status" DEFAULT 'not_applicable' NOT NULL,
  "extraction_warnings" text[] DEFAULT '{}'::text[] NOT NULL,
  CONSTRAINT "materials_object_fk" FOREIGN KEY ("id", "owner_user_id")
    REFERENCES "content_objects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "materials_title_nonempty_ck" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "materials_text_nonempty_ck" CHECK (length(btrim("extracted_text")) > 0),
  CONSTRAINT "materials_source_shape_ck" CHECK (
    (
      "kind" IN ('plain_text', 'markdown')
      AND "source_text" IS NOT NULL
      AND "source_url" IS NULL
      AND "fetched_at" IS NULL
      AND "terms_review_status" = 'not_applicable'
    ) OR (
      "kind" IN ('docx', 'pdf')
      AND "source_text" IS NULL
      AND "source_url" IS NULL
      AND "fetched_at" IS NULL
      AND "terms_review_status" = 'not_applicable'
    ) OR (
      "kind" = 'webpage'
      AND "source_text" IS NULL
      AND "source_url" IS NOT NULL
      AND "fetched_at" IS NOT NULL
      AND "terms_review_status" <> 'not_applicable'
    )
  )
);
CREATE UNIQUE INDEX "materials_id_owner_uq" ON "materials" ("id", "owner_user_id");
CREATE INDEX "materials_kind_idx" ON "materials" ("kind");

CREATE TABLE "content_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "content_object_id" uuid NOT NULL,
  "file_role" "content_file_role" NOT NULL,
  "storage_key" text NOT NULL,
  "original_filename" text DEFAULT '' NOT NULL,
  "mime_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "sha256" text NOT NULL,
  "expires_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "content_files_object_fk" FOREIGN KEY ("content_object_id", "owner_user_id")
    REFERENCES "content_objects" ("id", "owner_user_id") ON DELETE RESTRICT,
  CONSTRAINT "content_files_storage_key_uq" UNIQUE ("storage_key"),
  CONSTRAINT "content_files_size_ck" CHECK ("byte_size" >= 0),
  CONSTRAINT "content_files_sha256_ck" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "content_files_relative_key_ck" CHECK (
    "storage_key" !~ '(^/|\\|(^|/)\.\.(/|$))'
  ),
  CONSTRAINT "content_files_expiry_ck" CHECK (
    ("file_role" = 'raw_snapshot' AND "expires_at" IS NOT NULL)
    OR ("file_role" <> 'raw_snapshot' AND "expires_at" IS NULL)
  )
);
CREATE UNIQUE INDEX "content_files_single_source_role_uq"
  ON "content_files" ("content_object_id", "file_role")
  WHERE "file_role" IN ('original', 'raw_snapshot') AND "deleted_at" IS NULL;
CREATE INDEX "content_files_expiry_idx"
  ON "content_files" ("expires_at")
  WHERE "expires_at" IS NOT NULL AND "deleted_at" IS NULL;

CREATE OR REPLACE FUNCTION enforce_material_object_rules()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM content_objects
    WHERE id = NEW.id AND owner_user_id = NEW.owner_user_id AND object_type = 'material'
  ) THEN
    RAISE EXCEPTION 'material requires a material content object';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "materials_object_rules_trg"
BEFORE INSERT OR UPDATE ON "materials"
FOR EACH ROW EXECUTE FUNCTION enforce_material_object_rules();
