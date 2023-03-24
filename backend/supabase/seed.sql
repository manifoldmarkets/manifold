-- noinspection SqlNoDataSourceInspectionForFile

/***************************************************************/
/* 0. database-wide configuration */
/***************************************************************/

/* allow our backend and CLI users to have a long statement timeout */
alter role postgres set statement_timeout = '1h';
alter role service_role set statement_timeout = '1h';

/* for clustering without locks */
create extension if not exists pg_repack;

/* for fancy machine learning stuff */
create extension if not exists vector;

/* GIN trigram indexes */
create extension if not exists pg_trgm;

/* enable `explain` via the HTTP API for convenience */
alter role authenticator set pgrst.db_plan_enabled to true;
notify pgrst, 'reload config';

/* create a version of to_jsonb marked immutable so that we can index over it.
   see https://github.com/PostgREST/postgrest/issues/2594 */
create or replace function to_jsonb(jsonb) returns jsonb
immutable parallel safe strict
language sql as $$ select $1 $$;

/******************************************/
/* 1. tables containing firestore content */
/******************************************/

create table if not exists users (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table users enable row level security;
drop policy if exists "public read" on users;
create policy "public read" on users for select using (true);
create index if not exists users_data_gin on users using GIN (data);

/* indexes supporting @-mention autocomplete */
create index if not exists users_name_gin on users using GIN ((data->>'name') gin_trgm_ops);
create index if not exists users_username_gin on users using GIN ((data->>'username') gin_trgm_ops);
create index if not exists users_follower_count_cached on users ((to_jsonb(data->'followerCountCached')) desc);
alter table users cluster on users_pkey;

create table if not exists user_portfolio_history (
    user_id text not null,
    portfolio_id text not null,
    ts timestamp not null,
    investment_value numeric not null,
    balance numeric not null,
    total_deposits numeric not null,
    primary key(user_id, portfolio_id)
);
alter table user_portfolio_history enable row level security;
drop policy if exists "public read" on user_portfolio_history;
create policy "public read" on user_portfolio_history for select using (true);
create index if not exists user_portfolio_history_user_ts on user_portfolio_history (user_id, ts desc);
alter table user_portfolio_history cluster on user_portfolio_history_user_ts;

create table if not exists user_contract_metrics (
    user_id text not null,
    contract_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(user_id, contract_id)
);
alter table user_contract_metrics enable row level security;
drop policy if exists "public read" on user_contract_metrics;
create policy "public read" on user_contract_metrics for select using (true);
create index if not exists user_contract_metrics_gin on user_contract_metrics using GIN (data);
create index if not exists user_contract_metrics_recent_bets on user_contract_metrics (
     user_id,
     ((data->'lastBetTime')::bigint) desc
    );
create index if not exists user_contract_metrics_contract_id on user_contract_metrics (contract_id);
create index if not exists user_contract_metrics_weekly_profit on user_contract_metrics ((data->'from'->'week'->'profit'))
 where (data->'from'->'week'->'profit') is not null;
create index if not exists user_contract_metrics_user_id on user_contract_metrics (user_id);
create index if not exists user_contract_metrics_has_no_shares on user_contract_metrics (contract_id)
 where ((data)->>'hasNoShares') = 'true';
create index if not exists user_contract_metrics_has_yes_shares on user_contract_metrics (contract_id)
 where ((data)->>'hasYesShares') = 'true';
create index if not exists user_contract_metrics_profit on user_contract_metrics (contract_id)
 where ((data)->>'profit') is not null and ((data)->>'profit')::float > 0;
alter table user_contract_metrics cluster on user_contract_metrics_pkey;

create table if not exists user_follows (
    user_id text not null,
    follow_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(user_id, follow_id)
);
alter table user_follows enable row level security;
drop policy if exists "public read" on user_follows;
create policy "public read" on user_follows for select using (true);
create index if not exists user_follows_data_gin on user_follows using GIN (data);
alter table user_follows cluster on user_follows_pkey;

create table if not exists user_reactions (
    user_id text not null,
    reaction_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(user_id, reaction_id)
);
alter table user_reactions enable row level security;
drop policy if exists "public read" on user_reactions;
create policy "public read" on user_reactions for select using (true);
create index if not exists user_reactions_data_gin on user_reactions using GIN (data);
-- useful for getting just 'likes', we may want to index contentType as well
create index if not exists user_reactions_type
    on user_reactions (user_id, (to_jsonb(data)->>'type') desc);
-- useful for getting all reactions for a given contentId recently
create index if not exists user_reactions_content_id
  on user_reactions ((to_jsonb(data)->>'contentId'), (to_jsonb(data)->>'createdTime') desc);
alter table user_reactions cluster on user_reactions_type;

create table if not exists user_events (
    user_id text not null,
    event_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(user_id, event_id)
);
alter table user_events enable row level security;
drop policy if exists "public read" on user_events;
create policy "public read" on user_events for select using (true);
create index if not exists user_events_data_gin on user_events using GIN (data);
create index if not exists user_events_name on user_events (user_id, (data->>'name'));
create index if not exists user_events_viewed_markets
    on user_events (user_id, (data->>'name'), (data->>'contractId'), ((data->'timestamp')::bigint) desc)
    where data->>'name' = 'view market' or data->>'name' = 'view market card';
alter table user_events cluster on user_events_name;

create table if not exists user_seen_markets (
    user_id text not null,
    contract_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(user_id, contract_id)
);
alter table user_seen_markets enable row level security;
drop policy if exists "public read" on user_seen_markets;
create policy "public read" on user_seen_markets for select using (true);
create index if not exists user_seen_markets_data_gin on user_seen_markets using GIN (data);
alter table user_seen_markets cluster on user_seen_markets_pkey;

create table if not exists contracts (
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
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table contracts enable row level security;
drop policy if exists "public read" on contracts;
create policy "public read" on contracts for select using (true);
create index if not exists contracts_data_gin on contracts using GIN (data);
create index if not exists contracts_group_slugs_gin on contracts using GIN ((data->'groupSlugs'));
create index if not exists contracts_slug on contracts (slug);
create index if not exists contracts_creator_id on contracts (creator_id, created_time);
create index if not exists contracts_created_time on contracts (created_time desc);
create index if not exists contracts_close_time on contracts (close_time desc);
create index if not exists contracts_unique_bettors on contracts (((data->'uniqueBettors7Days')::int) desc);

alter table contracts cluster on contracts_creator_id;

create or replace function contract_populate_cols()
  returns trigger
  language plpgsql
as $$ begin
  if new.data is not null then
    new.slug := (new.data)->>'slug';
    new.question := (new.data)->>'question';
    new.creator_id := (new.data)->>'creatorId';
    new.visibility := (new.data)->>'visibility';
    new.mechanism := (new.data)->>'mechanism';
    new.outcome_type := (new.data)->>'outcomeType';
    new.created_time := case when new.data ? 'createdTime' then millis_to_ts(((new.data)->>'createdTime')::bigint) else null end;
    new.close_time := case when new.data ? 'closeTime' then millis_to_ts(((new.data)->>'closeTime')::bigint) else null end;
    new.resolution_time := case when new.data ? 'resolutionTime' then millis_to_ts(((new.data)->>'resolutionTime')::bigint) else null end;
    new.resolution_probability := ((new.data)->>'resolutionProbability')::numeric;
    new.resolution := (new.data)->>'resolution';
  end if;
  return new;
end $$;

create trigger contract_populate before insert or update on contracts
for each row execute function contract_populate_cols();

create table if not exists contract_answers (
    contract_id text not null,
    answer_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(contract_id, answer_id)
);
alter table contract_answers enable row level security;
drop policy if exists "public read" on contract_answers;
create policy "public read" on contract_answers for select using (true);
create index if not exists contract_answers_data_gin on contract_answers using GIN (data);
alter table contract_answers cluster on contract_answers_pkey;

create table if not exists contract_bets (
    contract_id text not null,
    bet_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(contract_id, bet_id)
);
alter table contract_bets enable row level security;
drop policy if exists "public read" on contract_bets;
create policy "public read" on contract_bets for select using (true);
create index if not exists contract_bets_data_gin on contract_bets using GIN (data);
/* serves bets API pagination */
create index if not exists contract_bets_bet_id on contract_bets (bet_id);
/* serving stats page, recent bets API */
create index if not exists contract_bets_created_time_global on contract_bets (
    (to_jsonb(data)->>'createdTime') desc
);
/* serving activity feed bets list */
create index concurrently contract_bets_activity_feed on contract_bets (
  (to_jsonb(data)->'isAnte'),
  (to_jsonb(data)->'isRedemption'),
  (to_jsonb(data)->>'createdTime') desc
);
/* serving e.g. the contract page recent bets and the "bets by contract" API */
create index if not exists contract_bets_created_time on contract_bets (
    contract_id,
    (to_jsonb(data)->>'createdTime') desc
);
/* serving "my trades on a contract" kind of queries */
create index if not exists contract_bets_contract_user_id on contract_bets (
    contract_id,
    (to_jsonb(data)->>'userId'),
    (to_jsonb(data)->>'createdTime') desc
);
/* serving the user bets API */
create index if not exists contract_bets_user_id on contract_bets (
    (to_jsonb(data)->>'userId'),
    (to_jsonb(data)->>'createdTime') desc
);
create index if not exists contract_bets_user_outstanding_limit_orders on contract_bets (
   (data->>'userId'),
   ((data->'isFilled')::boolean),
   ((data->'isCancelled')::boolean));
alter table contract_bets cluster on contract_bets_created_time;

create table if not exists contract_comments (
    contract_id text not null,
    comment_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(contract_id, comment_id)
);
alter table contract_comments enable row level security;
drop policy if exists "public read" on contract_comments;
create policy "public read" on contract_comments for select using (true);
create index if not exists contract_comments_data_gin on contract_comments using GIN (data);
alter table contract_comments cluster on contract_comments_pkey;

create table if not exists contract_follows (
    contract_id text not null,
    follow_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(contract_id, follow_id)
);
alter table contract_follows enable row level security;
drop policy if exists "public read" on contract_follows;
create policy "public read" on contract_follows for select using (true);
create index if not exists contract_follows_data_gin on contract_follows using GIN (data);
alter table contract_follows cluster on contract_follows_pkey;

create table if not exists contract_liquidity (
    contract_id text not null,
    liquidity_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(contract_id, liquidity_id)
);
alter table contract_liquidity enable row level security;
drop policy if exists "public read" on contract_liquidity;
create policy "public read" on contract_liquidity for select using (true);
create index if not exists contract_liquidity_data_gin on contract_liquidity using GIN (data);
alter table contract_liquidity cluster on contract_liquidity_pkey;

create table if not exists groups (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table groups enable row level security;
drop policy if exists "public read" on groups;
create policy "public read" on groups for select using (true);
create index if not exists groups_data_gin on groups using GIN (data);
alter table groups cluster on groups_pkey;

create table if not exists group_contracts (
    group_id text not null,
    contract_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(group_id, contract_id)
);
alter table group_contracts enable row level security;
drop policy if exists "public read" on group_contracts;
create policy "public read" on group_contracts for select using (true);
create index if not exists group_contracts_data_gin on group_contracts using GIN (data);
alter table group_contracts cluster on group_contracts_pkey;

create table if not exists group_members (
    group_id text not null,
    member_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(group_id, member_id)
);
alter table group_members enable row level security;
drop policy if exists "public read" on group_members;
create policy "public read" on group_members for select using (true);
create index if not exists group_members_data_gin on group_members using GIN (data);
alter table group_members cluster on group_members_pkey;

create table if not exists txns (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table txns enable row level security;
drop policy if exists "public read" on txns;
create policy "public read" on txns for select using (true);
create index if not exists txns_data_gin on txns using GIN (data);
alter table txns cluster on txns_pkey;

create table if not exists manalinks (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table manalinks enable row level security;
drop policy if exists "public read" on manalinks;
create policy "public read" on manalinks for select using (true);
create index if not exists manalinks_data_gin on manalinks using GIN (data);
alter table manalinks cluster on manalinks_pkey;

create table if not exists posts (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table posts enable row level security;
drop policy if exists "public read" on posts;
create policy "public read" on posts for select using (true);
create index if not exists posts_data_gin on posts using GIN (data);
alter table posts cluster on posts_pkey;

create table if not exists test (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table test enable row level security;
drop policy if exists "public read" on test;
create policy "public read" on test for select using (true);
create index if not exists test_data_gin on test using GIN (data);
alter table test cluster on test_pkey;

create table if not exists user_recommendation_features (
    user_id text not null primary key,
    f0 real not null,
    f1 real not null,
    f2 real not null,
    f3 real not null,
    f4 real not null
);
alter table user_recommendation_features enable row level security;
drop policy if exists "public read" on user_recommendation_features;
create policy "public read" on user_recommendation_features for select using (true);
drop policy if exists "admin write access" on user_recommendation_features;
create policy "admin write access" on user_recommendation_features
  as PERMISSIVE FOR ALL
  to service_role;

create table if not exists contract_recommendation_features (
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
create policy "public read" on contract_recommendation_features for select using (true);
drop policy if exists "admin write access" on contract_recommendation_features;
create policy "admin write access" on contract_recommendation_features
  as PERMISSIVE FOR ALL
  to service_role;
create index if not exists contract_recommendation_features_freshness_score on contract_recommendation_features (freshness_score desc);

create table if not exists user_embeddings (
    user_id text not null primary key,
    created_at timestamp not null default now(),
    interest_embedding vector(1536) not null
);
alter table user_embeddings enable row level security;
drop policy if exists "public read" on user_embeddings;
create policy "public read" on user_embeddings for select using (true);
drop policy if exists "admin write access" on user_embeddings;
create policy "admin write access" on user_embeddings
  as PERMISSIVE FOR ALL
  to service_role;

create table if not exists contract_embeddings (
    contract_id text not null primary key,
    created_at timestamp not null default now(),
    embedding vector(1536) not null
);
alter table contract_embeddings enable row level security;
drop policy if exists "public read" on contract_embeddings;
create policy "public read" on contract_embeddings for select using (true);
drop policy if exists "admin write access" on contract_embeddings;
create policy "admin write access" on contract_embeddings
  as PERMISSIVE FOR ALL
  to service_role;

create index if not exists contract_embeddings_embedding on contract_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
  alter publication supabase_realtime add table contracts;
  alter publication supabase_realtime add table contract_bets;
  alter publication supabase_realtime add table contract_comments;
  alter publication supabase_realtime add table group_members;
  alter publication supabase_realtime add table posts;
commit;

/***************************************************************/
/* 2. internal machinery for making firestore replication work */
/***************************************************************/

/* records all incoming writes to any logged firestore document */
create table if not exists incoming_writes (
  id bigint generated always as identity primary key,
  event_id text null, /* can be null for writes generated by manual import */
  table_id text not null,
  write_kind text not null,
  parent_id text null, /* null for top-level collections */
  doc_id text not null,
  data jsonb null, /* can be null on deletes */
  ts timestamp not null
);
alter table incoming_writes enable row level security;
create index if not exists incoming_writes_ts on incoming_writes (ts desc);
create index if not exists incoming_writes_table_id_ts on incoming_writes (table_id, ts desc);

/* records all deletions of firestore documents, with the deletion timestamp */
create table if not exists tombstones (
  id bigint generated always as identity primary key,
  table_id text not null,
  parent_id text null,
  doc_id text not null,
  fs_deleted_at timestamp not null,
  unique(table_id, parent_id, doc_id)
);
alter table tombstones enable row level security;
create index if not exists tombstones_table_id_doc_id_fs_deleted_at on tombstones (table_id, doc_id, fs_deleted_at desc);
alter table tombstones cluster on tombstones_table_id_doc_id_fs_deleted_at;

drop function if exists get_document_table_spec;
drop type if exists table_spec;
create type table_spec as (parent_id_col_name text, id_col_name text);

create or replace function get_document_table_spec(table_id text)
  returns table_spec
  language plpgsql
as
$$
begin
  return case table_id
    when 'users' then cast((null, 'id') as table_spec)
    when 'user_follows' then cast(('user_id', 'follow_id') as table_spec)
    when 'user_reactions' then cast(('user_id', 'reaction_id') as table_spec)
    when 'user_events' then cast(('user_id', 'event_id') as table_spec)
    when 'user_seen_markets' then cast(('user_id', 'contract_id') as table_spec)
    when 'contracts' then cast((null, 'id') as table_spec)
    when 'contract_answers' then cast(('contract_id', 'answer_id') as table_spec)
    when 'contract_bets' then cast(('contract_id', 'bet_id') as table_spec)
    when 'contract_comments' then cast(('contract_id', 'comment_id') as table_spec)
    when 'contract_follows' then cast(('contract_id', 'follow_id') as table_spec)
    when 'contract_liquidity' then cast(('contract_id', 'liquidity_id') as table_spec)
    when 'groups' then cast((null, 'id') as table_spec)
    when 'group_contracts' then cast(('group_id', 'contract_id') as table_spec)
    when 'group_members' then cast(('group_id', 'member_id') as table_spec)
    when 'txns' then cast((null, 'id') as table_spec)
    when 'manalinks' then cast((null, 'id') as table_spec)
    when 'posts' then cast((null, 'id') as table_spec)
    when 'test' then cast((null, 'id') as table_spec)
    when 'user_contract_metrics' then cast(('user_id', 'contract_id') as table_spec)
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
create or replace function replicate_writes_process_one(r incoming_writes)
  returns boolean
  language plpgsql
as
$$
declare dest_spec table_spec;
begin
  dest_spec = get_document_table_spec(r.table_id);
  if dest_spec is null then
    raise warning 'Invalid table ID: %', r.table_id;
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
    if exists (
      select from tombstones as t
      where t.table_id = r.table_id and t.doc_id = r.doc_id and t.fs_deleted_at > r.ts
      and t.parent_id is not distinct from r.parent_id /* mind nulls */
    ) then
      return true; /* case 3 */
    end if;
    if dest_spec.parent_id_col_name is not null then
      execute format(
        'insert into %1$I (%2$I, %3$I, data, fs_updated_time) values (%4$L, %5$L, %6$L, %7$L)
         on conflict (%2$I, %3$I) do nothing;',
        r.table_id, dest_spec.parent_id_col_name, dest_spec.id_col_name,
        r.parent_id, r.doc_id, r.data, r.ts
      );
    else
      execute format(
        'insert into %1$I (%2$I, data, fs_updated_time) values (%3$L, %4$L, %5$L)
         on conflict (%2$I) do nothing;',
        r.table_id, dest_spec.id_col_name,
        r.doc_id, r.data, r.ts
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
    if exists (
      select from tombstones as t
      where t.table_id = r.table_id and t.doc_id = r.doc_id and t.fs_deleted_at > r.ts
      and t.parent_id is not distinct from r.parent_id /* mind nulls */
    ) then
      return true; /* case 4 */
    end if;
    if dest_spec.parent_id_col_name is not null then
      execute format(
        'insert into %1$I (%2$I, %3$I, data, fs_updated_time) values (%4$L, %5$L, %6$L, %7$L)
         on conflict (%2$I, %3$I) do update set data = %6$L, fs_updated_time = %7$L
         where %1$I.fs_updated_time <= %7$L;',
        r.table_id, dest_spec.parent_id_col_name, dest_spec.id_col_name,
        r.parent_id, r.doc_id, r.data, r.ts
      );
    else
      execute format(
        'insert into %1$I (%2$I, data, fs_updated_time) values (%3$L, %4$L, %5$L)
         on conflict (%2$I) do update set data = %4$L, fs_updated_time = %5$L
         where %1$I.fs_updated_time <= %5$L;',
        r.table_id, dest_spec.id_col_name,
        r.doc_id, r.data, r.ts
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
        r.table_id, dest_spec.parent_id_col_name, dest_spec.id_col_name,
        r.parent_id, r.doc_id, r.ts
      );
    else
      execute format(
        'delete from %1$I where %2$I = %3$L and fs_updated_time <= %4$L',
        r.table_id, dest_spec.id_col_name,
        r.doc_id, r.ts
      );
    end if;
    /* update tombstone so inserts and updates can know when this document was deleted */
    insert into tombstones (table_id, parent_id, doc_id, fs_deleted_at) values (r.table_id, r.parent_id, r.doc_id, r.ts)
    on conflict (table_id, parent_id, doc_id) do update set fs_deleted_at = r.ts
    where tombstones.fs_deleted_at < r.ts;
  else
    raise warning 'Invalid write kind: %', r.write_kind;
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

create or replace function replicate_writes_process_since(since timestamp)
  returns table(id bigint, succeeded boolean)
  language plpgsql
as
$$
begin
  return query select r.id, replicate_writes_process_one(r) as succeeded
  from incoming_writes as r
  where r.ts >= since
  order by r.parent_id, r.doc_id;
end
$$;

create or replace function replicate_writes_process_new()
  returns trigger
  language plpgsql
as
$$
begin
  perform r.id, replicate_writes_process_one(r) as succeeded
  from new_table as r
  order by r.parent_id, r.doc_id;
  return null;
end
$$;

drop trigger if exists replicate_writes on incoming_writes;
create trigger replicate_writes
after insert on incoming_writes
referencing new table as new_table
for each statement
execute function replicate_writes_process_new();
