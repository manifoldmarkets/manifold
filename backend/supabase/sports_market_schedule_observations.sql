-- Latest acquired schedule and outstanding identity evidence, private to operators.
create table if not exists
  public.sports_market_schedule_observations (
    contract_id text not null references public.contracts (id) on delete cascade,
    provider text not null check (
      provider collate "C" ~ '^[a-z][a-z0-9-]*$'
      and provider in ('odds', 'bdl', 'football-data')
    ),
    observed_at timestamptz not null check (isfinite(observed_at)),
    counterpart_contract_ids text[] not null default '{}',
    same_event_contract_ids text[] not null default '{}',
    participant_mismatch boolean not null default false,
    primary key (contract_id, provider)
  );

alter table public.sports_market_schedule_observations enable row level security;

revoke all on public.sports_market_schedule_observations
from
  public,
  anon,
  authenticated,
  service_role;

grant
select
,
  insert,
update on public.sports_market_schedule_observations to service_role;
