begin;

create table if not exists
  membership_grants (
    id bigint generated always as identity primary key,
    user_id text not null references users (id) on delete cascade,
    tier text not null check (tier in ('basic', 'plus', 'premium')),
    duration_ms bigint not null check (duration_ms >= 0),
    source text not null,
    source_id text not null,
    status text not null check (status in ('banked', 'active', 'used', 'revoked')),
    created_time timestamptz not null default now(),
    started_time timestamptz,
    ends_time timestamptz,
    paused_paid jsonb,
    ended_time timestamptz,
    note text,
    unique (user_id, source, source_id),
    -- A grant cut to nothing by the holding cap is kept as a used receipt, so
    -- its source can't grant it again.
    check (
      duration_ms > 0
      or status = 'used'
    ),
    check (
      status <> 'active'
      or (
        started_time is not null
        and ends_time > started_time
        and ends_time is not null
      )
    )
  );

create unique index if not exists membership_grants_one_active on membership_grants (user_id)
where
  status = 'active';

create index if not exists membership_grants_status_ends on membership_grants (status, ends_time);

create table if not exists
  membership_notice_deliveries (
    notice_key text primary key,
    user_id text not null references users (id) on delete cascade,
    created_time timestamptz not null default now()
  );

alter table membership_notice_deliveries enable row level security;

do $$
declare
  r text;
begin
  if not (select relrowsecurity from pg_class where oid = 'membership_grants'::regclass) then
    alter table membership_grants enable row level security;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on membership_grants, membership_notice_deliveries from %I', r);
    end if;
  end loop;
end
$$;

commit;
