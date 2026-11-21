-- Lifetime HTTP response totals for a published BDL endpoint and process role.
-- Writers use the OpenAPI path template (e.g. v1/games/{id}) with its league
-- removed. Upsert the counters atomically, keeping the latest request's status
-- and quota, and the greatest success time when attempts finish out of order.
create table if not exists
  public.sports_bdl_request_stats (
    league_key text not null check (
      league_key in (
        'aba',
        'acb',
        'atp',
        'bbl',
        'bcl',
        'bnxt',
        'bsl',
        'bundesliga',
        'cba',
        'cbb',
        'cs',
        'dota',
        'epl',
        'eurocup',
        'euroleague',
        'f1',
        'fifa/worldcup',
        'gbl',
        'israel',
        'laliga',
        'lba',
        'ligue1',
        'lkl',
        'lnb',
        'lol',
        'lpga',
        'mlb',
        'mls',
        'mma',
        'nba',
        'ncaab',
        'ncaaf',
        'ncaaw',
        'nfl',
        'nhl',
        'pga',
        'seriea',
        'ucl',
        'valorant',
        'vtb',
        'wnba',
        'wta'
      )
    ),
    endpoint_template text not null check (
      length(endpoint_template) <= 128
      and endpoint_template ~ '^v[1-9][0-9]*/[a-z][a-z_-]*(/([a-z][a-z_-]*|[{](id|category|type)[}]))*$'
    ),
    process_role text not null check (
      process_role in ('scheduler', 'api', 'dev', 'recorder', 'codex')
    ),
    success_count bigint not null default 0 check (success_count >= 0),
    unauthorized_count bigint not null default 0 check (unauthorized_count >= 0),
    rate_limited_count bigint not null default 0 check (rate_limited_count >= 0),
    other_count bigint not null default 0 check (other_count >= 0),
    last_status smallint not null check (last_status between 100 and 599),
    last_request_at timestamptz not null,
    last_success_at timestamptz,
    quota_limit integer check (quota_limit >= 0),
    quota_remaining integer check (quota_remaining >= 0),
    primary key (league_key, endpoint_template, process_role),
    check (
      (success_count > 0) = (last_success_at is not null)
    ),
    check (last_success_at <= last_request_at),
    check (
      case
        when last_status >= 200
        and last_status < 300 then success_count
        when last_status = 401 then unauthorized_count
        when last_status = 429 then rate_limited_count
        else other_count
      end > 0
    )
  );

-- Service-owned aggregates. Supabase can grant table privileges by default,
-- including TRUNCATE, which PostgreSQL row-level policies do not govern.
alter table public.sports_bdl_request_stats enable row level security;

revoke all on public.sports_bdl_request_stats
from
  public,
  anon,
  authenticated,
  service_role;

grant
select
,
  insert,
update on public.sports_bdl_request_stats to service_role;
