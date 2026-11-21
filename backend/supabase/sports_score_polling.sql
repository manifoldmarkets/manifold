create table if not exists
  sports_score_polling (
    target text primary key,
    interval_seconds integer not null check (interval_seconds >= 0),
    updated_by text not null references users (id),
    updated_time timestamptz not null default now()
  );

alter table sports_score_polling enable row level security;
