create table if not exists
    user_feed (
                  id bigint generated always as identity primary key,
                  created_time timestamptz not null default now(),
                  seen_time timestamptz null, -- null means unseen
                  user_id text not null,
                  event_time timestamptz not null,
                  data_type text not null, -- 'new_comment', 'new_contract'
                  reason text not null, --  follow_user, follow_contract, etc
                  data jsonb null,
                  contract_id text null,
                  comment_id text null,
                  post_id bigint null,
                  creator_id text null,
                  news_id text null,
                  group_id text null,
                  reaction_id text null,
                  idempotency_key text null,
                  is_copied boolean not null default false,
                  bet_data jsonb null,
                  answer_ids text[] null,
                  relevance_score numeric default 0,
                  reasons text[] null,
                  seen_duration bigint null, -- ms
                  unique (user_id, idempotency_key)
);

alter table user_feed enable row level security;

drop policy if exists "public read" on user_feed;

create policy "public read" on user_feed for
    select
    using (true);

drop policy if exists "user can update" on user_feed;

create policy "user can update" on user_feed
    for update
    using (true);


create index if not exists user_feed_created_time_idx on user_feed (created_time);

create index if not exists user_feed_contract_items on user_feed (data_type, contract_id, greatest(created_time, seen_time) desc) where contract_id is not null;

create index if not exists user_feed_relevance_score_unseen on user_feed (user_id, relevance_score desc, seen_time);

create index if not exists user_feed_user_id_contract_id_created_time on user_feed (user_id, contract_id, created_time desc);

alter table user_feed
    cluster on user_feed_created_time;
