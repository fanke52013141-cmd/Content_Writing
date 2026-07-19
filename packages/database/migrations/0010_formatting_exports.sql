CREATE TYPE article_format_theme AS ENUM ('minimal', 'classic_wechat');
CREATE TYPE article_export_format AS ENUM ('markdown', 'html');

CREATE TABLE article_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE RESTRICT,
  article_id uuid NOT NULL,
  version_id uuid NOT NULL,
  theme article_format_theme NOT NULL,
  format article_export_format NOT NULL,
  filename text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_exports_article_fk FOREIGN KEY (article_id, owner_user_id)
    REFERENCES articles(id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT article_exports_version_fk FOREIGN KEY (version_id, owner_user_id)
    REFERENCES article_versions(id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT article_exports_content_nonempty_ck CHECK (length(content) > 0),
  CONSTRAINT article_exports_filename_nonempty_ck CHECK (length(btrim(filename)) > 0)
);

CREATE INDEX article_exports_owner_created_idx ON article_exports(owner_user_id, created_at DESC);
CREATE INDEX article_exports_article_created_idx ON article_exports(article_id, created_at DESC);
