
create table if not exists
    old_posts (
                  id text not null primary key default uuid_generate_v4 (),
                  data jsonb not null,
                  visibility text,
                  group_id text,
                  creator_id text,
                  created_time timestamptz default now(),
                  fs_updated_time timestamp
);

alter table old_posts enable row level security;

drop policy if exists "public read" on old_posts;

create policy "public read" on old_posts for
    select
    using (true);

alter table old_posts
    cluster on posts_pkey;
