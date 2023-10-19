create table if not exists
    lover_comments (
       id bigint generated always as identity primary key,
       user_id text not null,
       user_name text not null,
       user_username text not null,
       user_avatar_url text not null,
       on_user_id text not null,
       created_time        timestamptz not null default now(),
       content             jsonb not null,
       reply_to_comment_id bigint
);


alter table lover_comments enable row level security;

drop policy if exists "public read" on lover_comments;
create policy  "public read" on lover_comments using (true);

create index if not exists lover_comments_user_id_idx on lover_comments(on_user_id);
