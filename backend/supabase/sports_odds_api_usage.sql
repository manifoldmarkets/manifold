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
