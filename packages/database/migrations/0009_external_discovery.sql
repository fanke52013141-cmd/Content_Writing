CREATE TYPE external_source_kind AS ENUM ('hot_topic', 'search');
CREATE TYPE hot_topic_source AS ENUM (
  'douyin',
  'kuaishou',
  'weibo',
  'zhihu',
  'baidu',
  'toutiao',
  'thepaper',
  '36kr',
  'huxiu',
  'bilibili'
);

CREATE TABLE external_source_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE RESTRICT,
  kind external_source_kind NOT NULL,
  source_key text NOT NULL,
  display_name text NOT NULL,
  reference_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  terms_review_status terms_review_status NOT NULL DEFAULT 'pending',
  review_note text NOT NULL DEFAULT '',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_source_policies_owner_kind_key_uq UNIQUE (owner_user_id, kind, source_key),
  CONSTRAINT external_source_policies_enabled_review_ck CHECK (
    enabled = false OR terms_review_status = 'approved'
  ),
  CONSTRAINT external_source_policies_reviewed_at_ck CHECK (
    (terms_review_status = 'pending' AND reviewed_at IS NULL)
    OR (terms_review_status IN ('approved', 'restricted') AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX external_source_policies_owner_kind_idx
  ON external_source_policies(owner_user_id, kind, source_key);

CREATE TABLE hot_topic_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE RESTRICT,
  source hot_topic_source NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  description text NOT NULL DEFAULT '',
  popularity integer,
  rank integer NOT NULL,
  observed_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  provider_key text NOT NULL,
  CONSTRAINT hot_topic_items_owner_source_external_uq UNIQUE (owner_user_id, source, external_id),
  CONSTRAINT hot_topic_items_rank_ck CHECK (rank > 0),
  CONSTRAINT hot_topic_items_popularity_ck CHECK (popularity IS NULL OR popularity >= 0)
);

CREATE INDEX hot_topic_items_owner_source_fetched_idx
  ON hot_topic_items(owner_user_id, source, fetched_at DESC);

CREATE TABLE external_search_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE RESTRICT,
  query text NOT NULL,
  provider_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_search_runs_query_nonempty_ck CHECK (length(btrim(query)) > 0)
);

CREATE INDEX external_search_runs_owner_created_idx
  ON external_search_runs(owner_user_id, created_at DESC);

CREATE TABLE external_search_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES external_search_runs(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  snippet text NOT NULL DEFAULT '',
  domain text NOT NULL,
  published_at timestamptz,
  CONSTRAINT external_search_results_run_rank_uq UNIQUE (run_id, rank),
  CONSTRAINT external_search_results_rank_ck CHECK (rank > 0)
);

ALTER TABLE topics ADD COLUMN source_hot_topic_id uuid;
ALTER TABLE topics
  ADD CONSTRAINT topics_source_hot_topic_fk
  FOREIGN KEY (source_hot_topic_id) REFERENCES hot_topic_items(id) ON DELETE RESTRICT;
ALTER TABLE topics
  ADD CONSTRAINT topics_source_provenance_ck CHECK (
    (source = 'manual' AND source_generation_id IS NULL AND source_hot_topic_id IS NULL)
    OR (source = 'ai' AND source_generation_id IS NOT NULL AND source_hot_topic_id IS NULL)
    OR (source = 'hot_topic' AND source_generation_id IS NULL AND source_hot_topic_id IS NOT NULL)
  );
