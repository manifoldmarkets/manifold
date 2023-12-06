create table if not exists
    chart_annotations (
    id bigint generated always as identity primary key,
    created_time timestamptz not null default now(),
    event_time bigint not null,
    contract_id text not null,
    creator_id text not null,
    creator_username text not null,
    creator_name text not null,
    creator_avatar_url text not null,
    up_votes integer not null default 0,
    down_votes integer not null default 0,

    prob_change numeric null check (prob_change >= -1 and prob_change <= 1),
    user_username text null,
    user_name text null,
    user_avatar_url text null,
    user_id text null,
    comment_id text null,
    answer_id text null,
    thumbnail_url text null,
    external_url text null,
    text text null
);
alter table chart_annotations enable row level security;

drop policy if exists "public read" on chart_annotations;

create policy "public read" on chart_annotations using (true);

create index if not exists contract_annotations_event_time
    on chart_annotations (contract_id, event_time asc);

