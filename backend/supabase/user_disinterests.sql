
create table if not exists
    user_disinterests (
                          id bigint generated always as identity primary key,
                          user_id text not null,
                          creator_id text not null,
                          contract_id text not null,
                          comment_id text,
                          feed_id bigint,
                          created_time timestamptz not null default now()
);

alter table user_disinterests enable row level security;

drop policy if exists "public read" on user_disinterests;

create policy "public read" on user_disinterests for
    select
    using (true);

create index if not exists user_disinterests_user_id on user_disinterests (user_id);

create index if not exists user_disinterests_user_id_contract_id on user_disinterests (user_id, contract_id);

alter table user_disinterests
    cluster on user_disinterests_user_id;
