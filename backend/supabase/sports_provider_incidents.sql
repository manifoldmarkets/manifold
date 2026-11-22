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
    primary key (kind, league_key, subject),
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
        and subject collate "C" ~ '^[1-9][0-9]{0,15}$'
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
