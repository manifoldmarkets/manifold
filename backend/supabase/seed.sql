-- noinspection SqlNoDataSourceInspectionForFile
/ * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * /
/* 0. database-wide configuration */
/ * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * /
/* allow our backend and CLI users to have a long statement timeout */
alter role postgres
set
  statement_timeout = 0;

alter role service_role
set
  statement_timeout = '1h';

/* for clustering without locks */
create extension if not exists pg_repack;

/* for fancy machine learning stuff */
create extension if not exists vector;

/* GIN trigram indexes */
create extension if not exists pg_trgm;

/* for UUID generation */
create extension if not exists pgcrypto;

/* enable `explain` via the HTTP API for convenience */
alter role authenticator
set
  pgrst.db_plan_enabled to true;

notify pgrst,
'reload config';

/* create a version of to_jsonb marked immutable so that we can index over it.
see https://github.com/PostgREST/postgrest/issues/2594 */
create
or replace function to_jsonb(jsonb) returns jsonb immutable parallel safe strict language sql as $$
select $1
$$;

/******************************************/
/* 1. tables containing firestore content */
/******************************************/

create table if not exists private_users (
  id text not null primary key,
  data jsonb not null,
  fs_updated_time timestamp not null,
);

alter table private_users enable row level security;

drop policy if exists "private read" on private_users;
create policy "private read" on private_users for select
  using (firebase_uid() = id);

alter table private_users cluster on private_users_pkey;

create table if not exists
  user_portfolio_history (
    id bigint generated always as identity primary key,
    user_id text not null,
    ts timestamp not null,
    investment_value numeric not null,
    balance numeric not null,
    total_deposits numeric not null,
    loan_total numeric,
  );

alter table user_portfolio_history enable row level security;

drop policy if exists "public read" on user_portfolio_history;

create policy "public read" on user_portfolio_history for
select
  using (true);

create index if not exists user_portfolio_history_user_ts on user_portfolio_history (user_id, ts desc);

alter table user_portfolio_history
cluster on user_portfolio_history_user_ts;


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

create table if not exists
  user_reactions (
    user_id text not null,
    reaction_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key (user_id, reaction_id)
  );

alter table user_reactions enable row level security;

drop policy if exists "public read" on user_reactions;

create policy "public read" on user_reactions for
select
  using (true);

create index if not exists user_reactions_data_gin on user_reactions using GIN (data);

-- useful for getting just 'likes', we may want to index contentType as well
create index if not exists user_reactions_type on user_reactions (user_id, (to_jsonb(data) ->> 'type') desc);

-- useful for getting all reactions for a given contentId recently
create index if not exists user_reactions_content_id on user_reactions (
  (to_jsonb(data) ->> 'contentId'),
  (to_jsonb(data) ->> 'createdTime') desc
);

alter table user_reactions
cluster on user_reactions_type;

create table if not exists
  user_share_events (
    id bigint generated always as identity primary key,
    created_time timestamptz not null default now(),
    user_id text not null,
    contract_id text null,
    comment_id text null
  );

alter table user_share_events enable row level security;

drop policy if exists "public read" on user_share_events;

create policy "public read" on user_share_events for
select
  using (true);

create index if not exists user_share_events_user_id on user_share_events (user_id);

alter table user_share_events
cluster on user_share_events_user_id;

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

create table if not exists
  user_seen_markets (
    id bigint generated always as identity primary key,
    user_id text not null,
    contract_id text not null,
    data jsonb not null,
    created_time timestamptz not null default now(),
    -- so far we have: 'view market' or 'view market card'
    type text not null default 'view market'
  );

alter table user_seen_markets enable row level security;

drop policy if exists "public read" on user_seen_markets;

create policy "public read" on user_seen_markets for
select
  using (true);

drop policy if exists "user can insert" on user_seen_markets;

create policy "user can insert" on user_seen_markets for insert
with
  check (true);

create index if not exists user_seen_markets_created_time_desc_idx on user_seen_markets (user_id, contract_id, created_time desc);

create index if not exists user_seen_markets_type_created_time_desc_idx on user_seen_markets (
  contract_id,
  type,
  created_time desc
);

create index if not exists user_seen_markets_user_type_created_time_desc_idx on user_seen_markets (
  user_id,
  type,
  created_time desc
);

alter table user_seen_markets
cluster on user_seen_markets_created_time_desc_idx;

create table if not exists
  user_notifications (
    user_id text not null,
    notification_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key (user_id, notification_id)
  );

alter table user_notifications enable row level security;

drop policy if exists "public read" on user_notifications;

create policy "public read" on user_notifications for
select
  using (true);

-- TODO: maybe drop this one on july 13
create index if not exists user_notifications_created_time on user_notifications (user_id, (to_jsonb(data) -> 'createdTime') desc);

create index if not exists user_notifications_created_time_idx on user_notifications (user_id, ((data -> 'createdTime')::bigint) desc);

-- used for querying loan payouts (ugh)
create index if not exists user_notifications_notification_id on user_notifications (notification_id, user_id);

create index if not exists user_notifications_unseen_text_created_time_idx on user_notifications (
  user_id,
  -- Unfortunately casting to a boolean doesn't work in postgrest  ((data->'isSeen')::boolean),
  (data ->> 'isSeen'),
  ((data -> 'createdTime')::bigint) desc
);

alter table user_notifications
cluster on user_notifications_created_time_idx;

create table if not exists
  user_feed (
    id bigint generated always as identity primary key,
    created_time timestamptz not null default now(),
    seen_time timestamptz null, -- null means unseen
    user_id text not null,
    event_time timestamptz not null,
    data_type text not null, -- 'new_comment', 'new_contract', 'news_with_related_contracts'
    reason text not null, --  follow_user, follow_contract, etc
    data jsonb null,
    contract_id text null,
    comment_id text null,
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

create index if not exists user_feed_created_time on user_feed (user_id, created_time desc);

create index if not exists user_feed_contract_items on user_feed (data_type, contract_id, greatest(created_time, seen_time) desc) where contract_id is not null;

create index if not exists user_feed_relevance_score_unseen on user_feed (user_id, relevance_score desc, seen_time);

create index if not exists user_feed_user_id_contract_id_created_time on user_feed (user_id, contract_id, created_time desc);

alter table user_feed
cluster on user_feed_created_time;

create table if not exists
  contracts (
    id text not null primary key,
    slug text,
    question text,
    creator_id text,
    visibility text,
    mechanism text,
    outcome_type text,
    created_time timestamptz,
    close_time timestamptz,
    resolution_time timestamptz,
    resolution_probability numeric,
    resolution text,
    popularity_score numeric,
    importance_score numeric,
    data jsonb not null,
    question_fts tsvector generated always as (to_tsvector('english'::regconfig, question)) stored,
    question_nostop_fts tsvector generated always as (
      to_tsvector('english_nostop_with_prefix'::regconfig, question)
    ) stored,
    description_fts tsvector generated always as (
      to_tsvector(
        'english'::regconfig,
        add_creator_name_to_description (data)
      )
    ) stored,
    fs_updated_time timestamp not null,
    deleted boolean default false,
    group_slugs text[],
    views int default 0
  );

alter table contracts enable row level security;

drop policy if exists "public read" on contracts;

create policy "public read" on contracts for
select
  using (true);

create index if not exists contracts_slug on contracts (slug);

create index if not exists contracts_creator_id on contracts (creator_id, created_time);

create index if not exists contracts_created_time on contracts (created_time desc);

create index if not exists contracts_unique_bettors on contracts (((data->>'uniqueBettorCount')::integer) desc);

create index if not exists contracts_close_time on contracts (close_time desc);

create index if not exists contracts_popularity_score on contracts (popularity_score desc);

create index if not exists contracts_visibility on contracts (visibility);

create index if not exists description_fts on contracts using gin (description_fts);

create index if not exists idx_contracts_close_time_resolution_time_visibility on contracts (close_time, resolution_time, visibility);

create index if not exists contracts_importance_score on contracts (importance_score desc);

create index if not exists question_nostop_fts on contracts using gin (question_nostop_fts);

-- for calibration page
create index if not exists contracts_sample_filtering on contracts (
  outcome_type,
  resolution,
  visibility,
  ((data ->> 'uniqueBettorCount')::int)
);

create index if not exists contracts_on_importance_score_and_resolution_time_idx on contracts(importance_score, resolution_time);

create index if not exists contracts_last_updated_time on contracts(((data ->> 'lastUpdatedTime')::bigint) desc);

create index if not exists idx_lover_user_id1 on contracts ((data ->> 'loverUserId1')) where data->>'loverUserId1' is not null;
create index if not exists idx_lover_user_id2 on contracts ((data ->> 'loverUserId2')) where data->>'loverUserId2' is not null;

create index if not exists contracts_group_slugs on contracts (group_slugs);

alter table contracts
cluster on contracts_creator_id;

create
or replace function contract_populate_cols () returns trigger language plpgsql as $$
begin
  if new.data is not null then
    new.slug := (new.data) ->> 'slug';
    new.question := (new.data) ->> 'question';
    new.creator_id := (new.data) ->> 'creatorId';
    new.visibility := (new.data) ->> 'visibility';
    new.mechanism := (new.data) ->> 'mechanism';
    new.outcome_type := (new.data) ->> 'outcomeType';
    new.created_time := case
                          when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint)
                          else null
      end;
    new.close_time := case
                        when new.data ? 'closeTime' then millis_to_ts(((new.data) ->> 'closeTime')::bigint)
                        else null
      end;
    new.resolution_time := case
                             when new.data ? 'resolutionTime'
                               then millis_to_ts(((new.data) ->> 'resolutionTime')::bigint)
                             else null
      end;
    new.resolution_probability := ((new.data) ->> 'resolutionProbability')::numeric;
    new.resolution := (new.data) ->> 'resolution';
    new.popularity_score := coalesce(((new.data) ->> 'popularityScore')::numeric, 0);
    new.deleted := coalesce(((new.data) ->> 'deleted')::boolean, false);
    new.group_slugs := case
                           when new.data ? 'groupSlugs' then jsonb_array_to_text_array((new.data) -> 'groupSlugs')
                           else null
        end;
    new.views := coalesce(((new.data) ->> 'views')::int, 0);
  end if;
  return new;
end
$$;

create trigger contract_populate before insert
or
update on contracts for each row
execute function contract_populate_cols ();

create table if not exists
  platform_calibration (
    id bigint generated always as identity primary key,
    created_time timestamptz not null default now(),
    data jsonb not null
  );

alter table platform_calibration enable row level security;

drop policy if exists "public read" on platform_calibration;

create policy "public read" on platform_calibration for
select
  using (true);

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

create table if not exists
  contract_comment_edits (
    id serial primary key,
    contract_id text not null,
    comment_id text not null,
    editor_id text not null,
    data jsonb not null,
    created_time timestamptz not null default now()
  );

alter table contract_comment_edits enable row level security;

drop policy if exists "public read" on contract_comment_edits;

create policy "public read" on contract_comment_edits for
select
  using (true);

create index if not exists comment_edits_comment_id_idx on contract_comment_edits (comment_id);

create table if not exists
  chat_messages (
    id serial primary key,
    user_id text not null,
    channel_id text not null,
    content jsonb not null,
    user_name text not null,
    user_avatar_url text not null,
    user_username text not null,
    created_time timestamptz not null default now()
  );

alter table chat_messages enable row level security;

drop policy if exists "public read" on chat_messages;

create policy "public read" on chat_messages for
select
  using (true);
create index if not exists chat_messages_channel_id_idx
    on chat_messages (channel_id, created_time desc);

alter table chat_messages
    cluster on chat_messages_channel_id_idx;

create table if not exists
    league_chats (
                     id serial primary key,
                     channel_id text not null, -- link to chat_messages table
                     created_time timestamptz not null default now(),
                     season int not null, -- integer id of season, i.e. 1 for first season, 2 for second, etc.
                     division int not null, -- 1 (beginner) to 4 (expert)
                     cohort text not null, -- id of cohort (group of competing users). Unique across seasons.
                     owner_id text,
                     unique (season, division, cohort)
);

alter table league_chats enable row level security;

drop policy if exists "public read" on league_chats;

create policy "public read" on league_chats for
    select
    using (true);

create table if not exists
    user_seen_chats (
      id bigint generated always as identity primary key,
      user_id text not null,
      channel_id text not null,
      created_time timestamptz not null default now()
);

alter table user_seen_chats enable row level security;

drop policy if exists "public read" on user_seen_chats;

create policy "public read" on user_seen_chats for
    select
    using (true);

drop policy if exists "user can insert" on user_seen_chats;

create policy "user can insert" on user_seen_chats for insert
    with
    check (true);

create index if not exists user_seen_chats_created_time_desc_idx
    on user_seen_chats (user_id, channel_id, created_time desc);

alter table user_seen_chats
    cluster on user_seen_chats_created_time_desc_idx;


create table if not exists
  contract_follows (
    contract_id text not null,
    follow_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key (contract_id, follow_id)
  );

create index if not exists contract_follows_idx on contract_follows (follow_id);

alter table contract_follows enable row level security;

drop policy if exists "public read" on contract_follows;
drop policy if exists "user can insert" on contract_follows;
drop policy if exists "user can delete" on contract_follows;

create policy "public read" on contract_follows for
select
  using (true);
create policy "user can insert" on contract_follows for insert
    with check (firebase_uid() = follow_id);
create policy "user can delete" on contract_follows for delete
    using (firebase_uid() = follow_id);


alter table contract_follows
cluster on contract_follows_pkey;

create table if not exists
  contract_liquidity (
    contract_id text not null,
    liquidity_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key (contract_id, liquidity_id)
  );

alter table contract_liquidity enable row level security;

drop policy if exists "public read" on contract_liquidity;

create policy "public read" on contract_liquidity for
select
  using (true);

alter table contract_liquidity
cluster on contract_liquidity_pkey;

create table if not exists
  groups (
    id text not null primary key default uuid_generate_v4 (),
    data jsonb not null,
    fs_updated_time timestamp,
    privacy_status text,
    slug text not null,
    name text not null,
    name_fts tsvector generated always as (to_tsvector('english'::regconfig, name)) stored,
    creator_id text,
    total_members numeric default 0,
    importance_score numeric default 0
  );

alter table groups enable row level security;

drop policy if exists "public read" on groups;

create policy "public read" on groups for
select
  using (true);

alter table groups
cluster on groups_pkey;

create table if not exists
  user_quest_metrics (
    user_id text not null,
    score_id text not null,
    score_value numeric not null,
    idempotency_key text,
    primary key (user_id, score_id)
  );

alter table user_quest_metrics enable row level security;

drop policy if exists "public read" on user_quest_metrics;

create policy "public read" on user_quest_metrics for
select
  using (true);

alter table user_quest_metrics
cluster on user_quest_metrics_pkey;

create table if not exists
  txns (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
  );

alter table txns enable row level security;

drop policy if exists "public read" on txns;

create policy "public read" on txns for
select
  using (true);

create index if not exists txns_data_gin on txns using GIN (data);

alter table txns
cluster on txns_pkey;

-- for querying top market_ads
create index if not exists txns_category on txns ((data ->> 'category'), (data ->> 'toId'));


create table if not exists
  manalinks (
    id text not null primary key,
    amount numeric null,
    created_time timestamptz null,
    expires_time timestamptz null,
    creator_id text null,
    max_uses int null,
    message text null,
    data jsonb not null,
    fs_updated_time timestamp not null
  );

create index if not exists manalinks_creator_id on manalinks (creator_id);

alter table manalinks cluster on manalinks_creator_id;

create or replace function manalinks_populate_cols()
  returns trigger
  language plpgsql
as $$ begin
  if new.data is not null then
    new.amount := ((new.data)->>'amount')::numeric;
    new.created_time :=
        case when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint) else null end;
    new.expires_time :=
        case when new.data ? 'expiresTime' then millis_to_ts(((new.data) ->> 'expiresTime')::bigint) else null end;
    new.creator_id := (new.data)->>'fromId';
    new.max_uses := ((new.data)->>'maxUses')::numeric;
    new.message := (new.data)->>'message';
    if (new.data)->'claims' is not null then
        delete from manalink_claims where manalink_id = new.id;
        with claims as (select new.id, jsonb_array_elements((new.data)->'claims') as cdata)
        insert into manalink_claims (manalink_id, txn_id) select id, cdata->>'txnId' from claims;
    end if;
  end if;
  return new;
end $$;

drop trigger manalinks_populate on manalinks;
create trigger manalinks_populate before insert or update on manalinks
for each row execute function manalinks_populate_cols();

create table if not exists
  manalink_claims (
    manalink_id text not null,
    txn_id text not null,
    primary key (manalink_id, txn_id)
  );

alter table manalink_claims cluster on manalink_claims_pkey;

create table if not exists
  posts (
    id text not null primary key default uuid_generate_v4 (),
    data jsonb not null,
    visibility text,
    group_id text,
    creator_id text,
    created_time timestamptz default now(),
    fs_updated_time timestamp
  );

alter table posts enable row level security;

drop policy if exists "public read" on posts;

create policy "public read" on posts for
select
  using (true);

alter table posts
cluster on posts_pkey;

create table if not exists
  post_comments (
    post_id text not null,
    comment_id text not null default uuid_generate_v4 (),
    data jsonb not null,
    fs_updated_time timestamp,
    visibility text,
    user_id text,
    created_time timestamptz default now(),
    primary key (post_id, comment_id)
  );

alter table post_comments enable row level security;

drop policy if exists "public read" on post_comments;

create policy "public read" on post_comments for
select
  using (true);

drop policy if exists "user can insert" on post_comments;

create policy "user can insert" on post_comments for insert
with
  check (true);

alter table post_comments
cluster on post_comments_pkey;

create table if not exists
  user_recommendation_features (
    user_id text not null primary key,
    f0 real not null,
    f1 real not null,
    f2 real not null,
    f3 real not null,
    f4 real not null
  );

alter table user_recommendation_features enable row level security;

drop policy if exists "public read" on user_recommendation_features;

create policy "public read" on user_recommendation_features for
select
  using (true);

drop policy if exists "admin write access" on user_recommendation_features;

create policy "admin write access" on user_recommendation_features as PERMISSIVE for all to service_role;

create table if not exists
  contract_recommendation_features (
    contract_id text not null primary key,
    f0 real not null,
    f1 real not null,
    f2 real not null,
    f3 real not null,
    f4 real not null,
    freshness_score real not null default 1
  );

alter table contract_recommendation_features enable row level security;

drop policy if exists "public read" on contract_recommendation_features;

create policy "public read" on contract_recommendation_features for
select
  using (true);

drop policy if exists "admin write access" on contract_recommendation_features;

create policy "admin write access" on contract_recommendation_features as PERMISSIVE for all to service_role;

create index if not exists contract_recommendation_features_freshness_score on contract_recommendation_features (freshness_score desc);

create table if not exists
  user_embeddings (
    user_id text not null primary key,
    created_at timestamp not null default now(),
    interest_embedding vector (1536) not null,
    contract_view_embedding vector (1536),
    disinterest_embedding vector (1536)
  );

alter table user_embeddings enable row level security;

drop policy if exists "public read" on user_embeddings;

create policy "public read" on user_embeddings for
select
  using (true);

drop policy if exists "admin write access" on user_embeddings;

create policy "admin write access" on user_embeddings as PERMISSIVE for all to service_role;

create index if not exists user_embeddings_interest_embedding on user_embeddings using ivfflat (interest_embedding vector_cosine_ops)
with
  (lists = 500);

create table if not exists
  contract_embeddings (
    contract_id text not null primary key,
    created_at timestamp not null default now(),
    embedding vector (1536) not null
  );

alter table contract_embeddings enable row level security;

drop policy if exists "public read" on contract_embeddings;

create policy "public read" on contract_embeddings for
select
  using (true);

drop policy if exists "admin write access" on contract_embeddings;

create policy "admin write access" on contract_embeddings as PERMISSIVE for all to service_role;

set
  ivfflat.probes = 7;

create index if not exists contract_embeddings_embedding on contract_embeddings using ivfflat (embedding vector_cosine_ops)
with
  (lists = 500);

create table if not exists
  topic_embeddings (
    topic text not null primary key,
    created_at timestamp not null default now(),
    embedding vector (1536) not null
  );

alter table topic_embeddings enable row level security;

drop policy if exists "public read" on topic_embeddings;

create policy "public read" on topic_embeddings for
select
  using (true);

drop policy if exists "admin write access" on topic_embeddings;

create policy "admin write access" on topic_embeddings as PERMISSIVE for all to service_role;

create table if not exists
  group_embeddings (
    group_id text not null primary key,
    created_time timestamp not null default now(),
    embedding vector (1536) not null
  );

alter table group_embeddings enable row level security;

drop policy if exists "public read" on group_embeddings;

create policy "public read" on group_embeddings for
select
  using (true);

drop policy if exists "admin write access" on group_embeddings;

create policy "admin write access" on group_embeddings as PERMISSIVE for all to service_role;

create table if not exists
  user_topics (
    user_id text not null primary key,
    created_at timestamp not null default now(),
    topic_embedding vector (1536) not null,
    topics text[] not null
  );

alter table user_topics enable row level security;

drop policy if exists "public read" on user_topics;

create policy "public read" on user_topics for
select
  using (true);

drop policy if exists "public write access" on user_topics;

create policy "public write access" on user_topics for all using (true);

create table if not exists
  market_ads (
    id text not null primary key default uuid_generate_v4 (),
    user_id text not null,
    market_id text not null,
    foreign key (market_id) references contracts (id),
    funds numeric not null,
    cost_per_view numeric not null,
    created_at timestamp not null default now(),
    embedding vector (1536) not null,
  );

alter table market_ads enable row level security;

drop policy if exists "public read" on market_ads;

create policy "public read" on market_ads for
select
  using (true);

drop policy if exists "admin write access" on market_ads;

create policy "admin write access" on market_ads as PERMISSIVE for all to service_role;

create table if not exists
  leagues (
    user_id text not null,
    season int not null, -- integer id of season, i.e. 1 for first season, 2 for second, etc.
    division int not null, -- 1 (beginner) to 4 (expert)
    cohort text not null, -- id of cohort (group of competing users). Unique across seasons.
    mana_earned numeric not null default 0.0,
    mana_earned_breakdown jsonb not null default '{}'::jsonb, -- Key is category, value is total mana earned in that category
    rank_snapshot int,
    created_time timestamp not null default now(),
    unique (user_id, season)
  );

alter table leagues enable row level security;

drop policy if exists "public read" on leagues;

create policy "public read" on leagues for
select
  using (true);

create table if not exists
  stats (
    title text not null primary key,
    daily_values numeric[]
  );

alter table stats enable row level security;

drop policy if exists "public read" on stats;

create policy "public read" on stats for
select
  using (true);

create table if not exists
  portfolios (
    id text not null primary key,
    creator_id text not null,
    slug text not null,
    name text not null,
    items jsonb not null,
    created_time timestamptz not null default now()
  );

alter table portfolios enable row level security;

drop policy if exists "public read" on portfolios;

create policy "public read" on portfolios for
select
  using (true);

begin;

drop publication if exists supabase_realtime;

create publication supabase_realtime;

alter publication supabase_realtime
add table contracts;

alter publication supabase_realtime
add table contract_bets;

alter publication supabase_realtime
add table contract_comments;

alter publication supabase_realtime
add table post_comments;

alter publication supabase_realtime
add table group_contracts;

alter publication supabase_realtime
add table group_members;

alter publication supabase_realtime
add table user_notifications;

alter publication supabase_realtime
add table user_follows;

alter publication supabase_realtime
add table private_user_messages;

alter publication supabase_realtime
add table private_user_message_channel_members;

alter publication supabase_realtime
add table chart_annotations;

commit;

/ * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * /
/* 2. internal machinery for making firestore replication work */
/ * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * /
/* records all incoming writes to any logged firestore document */
create table if not exists
  incoming_writes (
    id bigint generated always as identity primary key,
    event_id text null,
    /* can be null for writes generated by manual import */
    table_id text not null,
    write_kind text not null,
    parent_id text null,
    /* null for top-level collections */
    doc_id text not null,
    data jsonb null,
    /* can be null on deletes */
    ts timestamp not null
  );

alter table incoming_writes enable row level security;

create index if not exists incoming_writes_ts on incoming_writes (ts desc);

create index if not exists incoming_writes_table_id_ts on incoming_writes (table_id, ts desc);

create index if not exists incoming_writes_event_id on incoming_writes (event_id);

/* records all deletions of firestore documents, with the deletion timestamp */
create table if not exists
  tombstones (
    id bigint generated always as identity primary key,
    table_id text not null,
    parent_id text null,
    doc_id text not null,
    fs_deleted_at timestamp not null,
    unique (table_id, parent_id, doc_id)
  );

alter table tombstones enable row level security;

create index if not exists tombstones_table_id_doc_id_fs_deleted_at on tombstones (table_id, doc_id, fs_deleted_at desc);

alter table tombstones
cluster on tombstones_table_id_doc_id_fs_deleted_at;

drop function if exists get_document_table_spec;

drop type if exists table_spec;

create type table_spec as (parent_id_col_name text, id_col_name text);

create
or replace function get_document_table_spec (table_id text) returns table_spec language plpgsql as $$
begin
  return case
    table_id
           when 'users' then cast((null, 'id') as table_spec)
           when 'private_users' then cast((null, 'id') as table_spec)
           when 'user_reactions' then cast(('user_id', 'reaction_id') as table_spec)
           when 'contracts' then cast((null, 'id') as table_spec)
           when 'contract_answers' then cast(('contract_id', 'answer_id') as table_spec)
           when 'answers' then cast((null, 'id') as table_spec)
           when 'contract_bets' then cast(('contract_id', 'bet_id') as table_spec)
           when 'contract_comments' then cast(('contract_id', 'comment_id') as table_spec)
           when 'contract_follows' then cast(('contract_id', 'follow_id') as table_spec)
           when 'contract_liquidity' then cast(('contract_id', 'liquidity_id') as table_spec)
           when 'txns' then cast((null, 'id') as table_spec)
           when 'manalinks' then cast((null, 'id') as table_spec)
           else null
    end;
end
$$;

/* takes a single new firestore write and replicates it into the database.
the contract of this function is:
- if you have a set of timestamped firestore writes, and you call this function
*at least once* on *every write*, in *any order*, then the database will be
the same and correct at the end.
*/
create
or replace function replicate_writes_process_one (r incoming_writes) returns boolean language plpgsql as $$
declare
  dest_spec table_spec;
begin
  dest_spec = get_document_table_spec(r.table_id);
  if dest_spec is null then
    raise warning 'Invalid table ID: %',
      r.table_id;
    return false;
  end if;
  if r.write_kind = 'create' then
/* possible cases:
 - if this is the most recent write to the document:
 1. common case: the document must not exist and this is a brand new document; insert it
 - if this is not the most recent write to the document:
 2. the document already exists due to other more recent inserts or updates; do nothing
 3. the document has been more recently deleted; do nothing
 */
    if exists(
        select
        from tombstones as t
        where t.table_id = r.table_id
          and t.doc_id = r.doc_id
          and t.fs_deleted_at > r.ts
          and t.parent_id is not distinct from r.parent_id
      /* mind nulls */
      ) then
      return true;
/* case 3 */
    end if;
    if dest_spec.parent_id_col_name is not null then
      execute format(
          'insert into %1$I (%2$I, %3$I, data, fs_updated_time) values (%4$L, %5$L, %6$L, %7$L)
                 on conflict (%2$I, %3$I) do nothing;',
          r.table_id,
          dest_spec.parent_id_col_name,
          dest_spec.id_col_name,
          r.parent_id,
          r.doc_id,
          r.data,
          r.ts
        );
    else
      execute format(
          'insert into %1$I (%2$I, data, fs_updated_time) values (%3$L, %4$L, %5$L)
                 on conflict (%2$I) do nothing;',
          r.table_id,
          dest_spec.id_col_name,
          r.doc_id,
          r.data,
          r.ts
        );
    end if;
  elsif r.write_kind = 'update' then
/* possible cases:
 - if this is the most recent write to the document:
 1. common case: the document exists; update it
 2. less common case: the document doesn't exist yet because there is an insert we haven't got; insert it
 - if this is not the most recent write to the document:
 3. the document exists but has more recent updates; do nothing
 4. the document has been more recently deleted; do nothing
 */
    if exists(
        select
        from tombstones as t
        where t.table_id = r.table_id
          and t.doc_id = r.doc_id
          and t.fs_deleted_at > r.ts
          and t.parent_id is not distinct from r.parent_id
      /* mind nulls */
      ) then
      return true;
/* case 4 */
    end if;
    if dest_spec.parent_id_col_name is not null then
      execute format(
          'insert into %1$I (%2$I, %3$I, data, fs_updated_time) values (%4$L, %5$L, %6$L, %7$L)
                 on conflict (%2$I, %3$I) do update set data = %6$L, fs_updated_time = %7$L
                 where %1$I.fs_updated_time <= %7$L;',
          r.table_id,
          dest_spec.parent_id_col_name,
          dest_spec.id_col_name,
          r.parent_id,
          r.doc_id,
          r.data,
          r.ts
        );
    else
      execute format(
          'insert into %1$I (%2$I, data, fs_updated_time) values (%3$L, %4$L, %5$L)
                 on conflict (%2$I) do update set data = %4$L, fs_updated_time = %5$L
                 where %1$I.fs_updated_time <= %5$L;',
          r.table_id,
          dest_spec.id_col_name,
          r.doc_id,
          r.data,
          r.ts
        );
    end if;
  elsif r.write_kind = 'delete' then
/* possible cases:
 - if this is the most recent write to the document:
 1. common case: the document must exist; delete it
 - if this is not the most recent write to the document:
 2. the document was already deleted; do nothing
 3. the document exists because it has a more recent insert or update; do nothing
 */
    if dest_spec.parent_id_col_name is not null then
      execute format(
          'delete from %1$I where %2$I = %4$L and %3$I = %5$L and fs_updated_time <= %6$L',
          r.table_id,
          dest_spec.parent_id_col_name,
          dest_spec.id_col_name,
          r.parent_id,
          r.doc_id,
          r.ts
        );
    else
      execute format(
          'delete from %1$I where %2$I = %3$L and fs_updated_time <= %4$L',
          r.table_id,
          dest_spec.id_col_name,
          r.doc_id,
          r.ts
        );
    end if;
/* update tombstone so inserts and updates can know when this document was deleted */
    insert into tombstones (table_id, parent_id, doc_id, fs_deleted_at)
    values (r.table_id, r.parent_id, r.doc_id, r.ts)
    on conflict (table_id, parent_id, doc_id) do update
      set fs_deleted_at = r.ts
    where tombstones.fs_deleted_at < r.ts;
  else
    raise warning 'Invalid write kind: %',
      r.write_kind;
    return false;
  end if;
  return true;
end
$$;

/* when processing batches of writes, we order by document ID to avoid deadlocks
when incoming write batches hit the same documents with new writes in different
sequences. */
/* todo: we could process batches more efficiently by doing batch modifications for
each destination table in the batch, but likely not important right now */
create
or replace function replicate_writes_process_since (since timestamp) returns table (id bigint, succeeded boolean) language plpgsql as $$
begin
  return query
    select r.id,
           replicate_writes_process_one(r) as succeeded
    from incoming_writes as r
    where r.ts >= since
    order by r.parent_id,
             r.doc_id;
end
$$;

create
or replace function replicate_writes_process_new () returns trigger language plpgsql as $$
begin
  perform r.id, replicate_writes_process_one(r) as succeeded
  from new_table as r
  order by r.parent_id,
           r.doc_id;
  return null;
end
$$;

drop trigger if exists replicate_writes on incoming_writes;

create trigger replicate_writes
after insert on incoming_writes referencing new table as new_table for each statement
execute function replicate_writes_process_new ();

create text search dictionary english_stem_nostop (template = snowball, language = english);

create text search dictionary english_prefix (template = simple);

create text search configuration public.english_nostop_with_prefix (
  copy = english
);

alter text search configuration public.english_nostop_with_prefix
alter mapping for asciiword,
asciihword,
hword_asciipart,
hword,
hword_part,
word
with
  english_stem_nostop,
  english_prefix;

create table if not exists
  news (
    id serial primary key,
    created_time timestamp not null default now(),
    title text not null,
    url text not null,
    published_time timestamp not null,
    author text,
    description text,
    image_url text,
    source_id text,
    source_name text,
    title_embedding vector (1536) not null,
    -- A news row should have contract_ids and/or group_ids
    contract_ids text[] null,
    group_ids text[] null
  );

alter table news enable row level security;

drop policy if exists "public read" on news;

create policy "public read" on news for
select
  using (true);
