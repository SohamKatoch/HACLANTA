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
