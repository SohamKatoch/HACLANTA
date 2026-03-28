-- Numeric features only; no image blobs.
-- Run this in the Supabase SQL editor.

create table if not exists public.user_data (
  id text primary key,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  display_name text null
);

create table if not exists public.feature_log (
  id bigint generated always as identity primary key,
  user_id text null references public.user_data(id) on delete set null,
  eye_closure double precision not null check (eye_closure >= 0 and eye_closure <= 1),
  blink_rate double precision not null check (blink_rate >= 0),
  head_tilt double precision not null check (head_tilt >= 0 and head_tilt <= 1),
  reaction_time double precision not null check (reaction_time >= 0),
  status text not null check (status in ('SAFE', 'NOT SAFE')),
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  score double precision null check (score >= 0 and score <= 1),
  source text not null default 'web',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists feature_log_user_id_idx on public.feature_log (user_id);
create index if not exists feature_log_created_at_idx on public.feature_log (created_at desc);

create table if not exists public.reaction_tests (
  id bigint generated always as identity primary key,
  user_id text null references public.user_data(id) on delete set null,
  reaction_time_sec double precision not null check (reaction_time_sec >= 0),
  source text not null default 'web',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists reaction_tests_user_id_idx on public.reaction_tests (user_id);
create index if not exists reaction_tests_created_at_idx on public.reaction_tests (created_at desc);
