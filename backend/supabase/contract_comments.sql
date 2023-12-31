
create table if not exists
    contract_comments (
                          contract_id text not null,
                          comment_id text not null,
                          data jsonb not null,
                          fs_updated_time timestamp not null,
                          primary key (contract_id, comment_id),
                          visibility text,
                          user_id text not null,
                          created_time timestamptz not null
);

alter table contract_comments enable row level security;

drop policy if exists "public read" on contract_comments;

create policy "public read" on contract_comments for
    select
    using (true);

create index contract_comments_contract_id_created_time_idx on contract_comments (contract_id, created_time desc);

create index contract_comments_data_likes_idx on contract_comments (((data -> 'likes')::numeric));

create index contract_replies on contract_comments ((data ->> 'replyToCommentId'), contract_id, created_time desc);

create index contract_comments_created_time_idx on contract_comments (created_time desc);

alter table contract_comments
    cluster on contract_comments_pkey;
