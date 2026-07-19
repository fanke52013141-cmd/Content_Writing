CREATE TYPE model_provider_kind AS ENUM ('openai_compatible', 'openrouter', 'newapi', 'custom');

CREATE TABLE model_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  kind model_provider_kind NOT NULL,
  base_url text NOT NULL,
  model text NOT NULL,
  api_key_ciphertext text,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_provider_configs_name_nonempty_ck CHECK (length(btrim(name)) > 0),
  CONSTRAINT model_provider_configs_model_nonempty_ck CHECK (length(btrim(model)) > 0)
);
CREATE INDEX model_provider_configs_owner_enabled_idx ON model_provider_configs(owner_user_id, enabled, updated_at DESC);

CREATE TYPE deletion_mode AS ENUM ('archive', 'soft', 'permanent');
CREATE TABLE deletion_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE RESTRICT,
  object_id uuid NOT NULL,
  object_type text NOT NULL,
  mode deletion_mode NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deletion_audits_type_nonempty_ck CHECK (length(btrim(object_type)) > 0)
);
CREATE INDEX deletion_audits_owner_occurred_idx ON deletion_audits(owner_user_id, occurred_at DESC);
