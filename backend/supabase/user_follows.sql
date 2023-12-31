create table if not exists
    user_follows (
                     user_id text not null,
                     follow_id text not null,
                     created_time timestamptz not null default now(),
                     primary key (user_id, follow_id)
);

alter table user_follows enable row level security;

drop policy if exists "public read" on user_follows;

create policy "public read" on user_follows for
    select
    using (true);

alter table user_follows
    cluster on user_follows_pkey;
