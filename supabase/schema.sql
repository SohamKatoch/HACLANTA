-- Numeric features only; no image blobs.
-- user_id is optional opaque text (e.g. browser UUID); no FK so anonymous IDs work without a user_data row.

create table if not exists user_data (
  id text primary key,
  created_at timestamptz not null default now(),
  display_name text null
);

create table if not exists feature_log (
  id bigint generated always as identity primary key,
  user_id text null,
  eye_closure double precision not null,
  blink_rate double precision not null,
  head_tilt double precision not null,
  reaction_time double precision not null,
  status text not null,
  confidence double precision not null,
  created_at timestamptz not null default now()
);

create table if not exists reaction_tests (
  id bigint generated always as identity primary key,
  user_id text null,
  reaction_time_sec double precision not null,
  created_at timestamptz not null default now()
);
