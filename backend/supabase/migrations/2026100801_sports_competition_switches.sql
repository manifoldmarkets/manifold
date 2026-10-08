-- Admin switches for the sports scheduler: whether it creates game markets
-- for a calendar phase (common/src/sports-calendar.ts), set from
-- /admin/sports. A phase without a row runs on its `autoCreate` default, so an
-- empty table changes nothing.
create table if not exists sports_competition_switches (
  competition_id text not null,
  phase text not null,
  enabled boolean not null,
  updated_by text not null references users(id),
  updated_time timestamptz not null default now(),
  primary key (competition_id, phase)
);

-- Reads and writes go through the API and the scheduler.
alter table sports_competition_switches enable row level security;
