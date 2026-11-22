-- A private current observation per maintained league or official event.
create table if not exists
  public.sports_provider_incidents (
    kind text not null check (
      kind in ('calendar_expiry', 'classification_empty')
    ),
    league_key text not null check (
      length(league_key) <= 64
      and league_key collate "C" ~ '^[a-z0-9][a-z0-9/_-]*$'
    ),
    subject text not null,
    provider text,
    scope_key text not null check (length(scope_key) between 1 and 80),
    last_observed_at timestamptz not null,
    first_seen_at timestamptz,
    opened_at timestamptz,
    calendar_end date,
    -- Calendar rows have no provider. PostgreSQL treats those nulls as equal.
    unique nulls not distinct (kind, league_key, subject, provider),
    check (first_seen_at <= last_observed_at),
    check (
      opened_at is null
      or (
        first_seen_at is not null
        and opened_at between first_seen_at and last_observed_at
      )
    ),
    check (
      (
        kind = 'calendar_expiry'
        and subject = 'calendar'
        and provider is null
        and calendar_end is not null
      )
      or (
        kind = 'classification_empty'
        -- External IDs are opaque, including namespaced and nonnumeric IDs.
        and length(subject) between 1 and 256
        and subject collate "C" ~ U&'[^ \00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
        and subject collate "C" !~ U&'[\0001-\001F\007F-\009F]'
        and provider is not null
        and provider in ('bdl', 'odds', 'football-data')
        and calendar_end is null
      )
    )
  );

alter table public.sports_provider_incidents enable row level security;

revoke all on public.sports_provider_incidents
from
  public,
  anon,
  authenticated,
  service_role;

grant
select
,
  insert,
update,
delete on public.sports_provider_incidents to service_role;
