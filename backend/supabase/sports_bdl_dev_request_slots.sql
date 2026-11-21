-- Service-only scheduling state for all dev BDL API and scheduler processes.
create table if not exists
  public.sports_bdl_dev_request_slots (
    scope text primary key,
    next_request_at timestamptz not null
  );

alter table public.sports_bdl_dev_request_slots enable row level security;

revoke all on public.sports_bdl_dev_request_slots
from
  public,
  anon,
  authenticated,
  service_role;

grant
select
,
  insert,
update on public.sports_bdl_dev_request_slots to service_role;
