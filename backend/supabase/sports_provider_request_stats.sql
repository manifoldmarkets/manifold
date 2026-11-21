-- Lifetime HTTP response totals per provider, league, endpoint template and role.
-- Each writer supplies a published template without request parameters. The
-- upsert increments counts atomically and retains the most recent observation.
create table if not exists
  public.sports_provider_request_stats (
    provider text not null check (
      provider collate "C" ~ '^[a-z][a-z0-9-]*$'
      and provider in ('odds', 'bdl', 'football-data')
    ),
    league_key text not null check (
      length(league_key) <= 64
      and league_key collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9/_-]*$'
    ),
    endpoint_template text not null check (
      length(endpoint_template) between 1 and 128
      -- ECMAScript trim whitespace (ASCII controls are already disallowed below).
      and endpoint_template collate "C" ~ U&'[^ \00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
      -- A literal question mark or a Unicode C0/C1 control is never a template.
      and endpoint_template collate "C" !~ U&'[?\0001-\001F\007F-\009F]'
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
    primary key (
      provider,
      league_key,
      endpoint_template,
      process_role
    ),
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
alter table public.sports_provider_request_stats enable row level security;

revoke all on public.sports_provider_request_stats
from
  public,
  anon,
  authenticated,
  service_role;

grant
select
,
  insert,
update on public.sports_provider_request_stats to service_role;
