-- Controls for the sports scheduler, set from /admin/sports.
-- Whether the scheduler creates game markets for a calendar phase
-- (common/src/sports-calendar.ts). A phase without a row runs on its
-- `autoCreate` default, so an empty table changes nothing.
create table if not exists
  sports_competition_switches (
    competition_id text not null,
    phase text not null,
    enabled boolean not null,
    updated_by text not null references users (id),
    updated_time timestamptz not null default now(),
    primary key (competition_id, phase)
  );

-- Reads and writes go through the API and the scheduler.
alter table sports_competition_switches enable row level security;

-- How often the sports resolver asks for scores
-- (common/src/sports-score-polling.ts), set from /admin/sports. target is
-- 'sport:<sport id>' (live scores for a sport), 'game:<contract id>' (one game's
-- override) or 'finals'. interval_seconds 0 is off; a missing row means the
-- default.
create table if not exists
  sports_score_polling (
    target text primary key,
    interval_seconds integer not null check (interval_seconds >= 0),
    updated_by text not null references users (id),
    updated_time timestamptz not null default now()
  );

alter table sports_score_polling enable row level security;

-- The Odds API's credits, from the headers of every call: one row per UTC day
-- and sport key, with the period's used and remaining after the day's last
-- call.
create table if not exists
  sports_odds_api_usage (
    day date not null,
    sport_key text not null,
    calls integer not null default 0,
    credits integer not null default 0,
    used_after integer,
    remaining_after integer,
    updated_time timestamptz not null default now(),
    primary key (day, sport_key)
  );

create index if not exists sports_odds_api_usage_updated_time on sports_odds_api_usage (updated_time desc);

alter table sports_odds_api_usage enable row level security;
