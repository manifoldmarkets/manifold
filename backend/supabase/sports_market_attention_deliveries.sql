create table if not exists
  public.sports_market_attention_deliveries (
    contract_id text not null references public.contracts (id) on delete cascade,
    provider text not null check (provider in ('bdl', 'odds', 'football-data')),
    league_key text not null check (
      length(league_key) between 1 and 64
      and league_key collate "C" ~ '^[A-Za-z0-9]+([/_-][A-Za-z0-9]+)*$'
    ),
    incident_key text not null check (length(incident_key) between 1 and 1024),
    reason text not null check (length(reason) between 1 and 128),
    occurred_at timestamptz not null,
    retry_at timestamptz not null,
    primary key (contract_id, provider, incident_key)
  );

create index if not exists sports_market_attention_delivery_due_idx on public.sports_market_attention_deliveries (
  provider,
  league_key,
  retry_at,
  contract_id,
  incident_key
);

alter table public.sports_market_attention_deliveries enable row level security;

revoke all on public.sports_market_attention_deliveries
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
delete on public.sports_market_attention_deliveries to service_role;
