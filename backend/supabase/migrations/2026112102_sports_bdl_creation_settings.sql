-- A league owns its opening ante and daily cap; all leagues in a wave share
-- one monthly cap, and all waves share the same outstanding-ante ceiling.
create table if not exists
  public.sports_bdl_creation_settings (
    scope text primary key,
    ante_cap integer not null check (ante_cap >= 0),
    base_ante integer,
    cutover_date date,
    group_slugs text[],
    updated_by text not null,
    updated_at timestamptz not null default now(),
    check (
      (
        scope in ('nba', 'nhl', 'wnba', 'mlb', 'nfl')
        and base_ante is not null
        and base_ante > 0
        and cutover_date is not null
        and isfinite(cutover_date)
        and group_slugs is not null
        and cardinality(group_slugs) <= 8
        and group_slugs = string_to_array(array_to_string(group_slugs, ','), ',')
        and array_to_string(group_slugs, ',') ~ '^[a-z0-9-]+(,[a-z0-9-]+)*$'
      )
      or (
        scope in ('wave:1', 'wave:2', 'wave:3', 'global')
        and base_ante is null
        and cutover_date is null
        and group_slugs is null
      )
    )
  );

alter table public.sports_bdl_creation_settings enable row level security;

revoke all on public.sports_bdl_creation_settings
from
  public,
  anon,
  authenticated,
  service_role;

grant
select
,
  insert,
update on public.sports_bdl_creation_settings to service_role;
