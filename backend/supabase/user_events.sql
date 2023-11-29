
create table if not exists
    user_events (
                    id bigint generated always as identity primary key,
                    ts timestamptz not null default now(),
                    name text not null,
                    user_id text null,
                    contract_id text null,
                    comment_id text null,
                    ad_id text null,
                    data jsonb not null
);

alter table user_events enable row level security;

drop policy if exists "self and admin read" on user_events;

create policy "self and admin read" on user_events for
    select
    with check (user_id = firebase_uid() or is_admin(firebase_uid()));

-- mqp: we should fix this up so that users can only insert their own events.
-- but right now it's blocked because our application code is too dumb to wait
-- for auth to be done until it starts sending events
drop policy if exists "user can insert" on user_events;

create policy "user can insert" on user_events for insert
    with
    check (true);

create index if not exists user_events_name on user_events (user_id, name);

-- useful for user quests
create index if not exists user_events_ts on user_events (user_id, ts);

-- useful for tracking signed out market views
create index if not exists user_events_contract_name_ts on user_events (user_id, name, contract_id, ts);

create index if not exists user_events_comment_view on user_events (user_id, ts, comment_id) where name = 'view comment thread';

alter table user_events
    cluster on user_events_name;
