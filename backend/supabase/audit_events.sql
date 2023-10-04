create table if not exists
    audit_events (
                     id bigint generated always as identity primary key,
                     ts timestamptz not null default now(),
                     name text not null,
                     user_id text not null,
                     contract_id text null,
                     comment_id text null,
                     data jsonb null
);

alter table audit_events enable row level security;

drop policy if exists "public read" on audit_events;

create policy "public read" on audit_events for
    select
    using (true);
create index if not exists audit_events_name on audit_events (user_id, name);
alter table audit_events
    cluster on audit_events_name;