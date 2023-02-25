-- noinspection SqlNoDataSourceInspectionForFile

/***************************************************************/
/* 0. database-wide configuration */
/***************************************************************/

/* allow our backend to have a long statement timeout */
alter role service_role set statement_timeout = '120s';

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

create table if not exists user_portfolio_history (
    user_id text not null,
    portfolio_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key(user_id, portfolio_id)
);
alter table user_portfolio_history enable row level security;
drop policy if exists "public read" on user_portfolio_history;
create policy "public read" on user_portfolio_history for select using (true);
create index if not exists user_portfolio_history_gin on user_portfolio_history using GIN (data);
create index if not exists user_portfolio_history_timestamp on user_portfolio_history (user_id, (to_jsonb(data->'timestamp')) desc);

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
create index if not exists user_events_viewed_markets
    on user_events (user_id, (data->>'name'), (data->>'contractId'), ((data->'timestamp')::bigint) desc)
    where data->>'name' = 'view market' or data->>'name' = 'view market card';

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

create table if not exists contracts (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table contracts enable row level security;
drop policy if exists "public read" on contracts;
create policy "public read" on contracts for select using (true);
create index if not exists contracts_data_gin on contracts using GIN (data);
create index if not exists contracts_group_slugs_gin on contracts using GIN ((data->'groupSlugs'));
create index if not exists contracts_creator_id on contracts ((data->>'creatorId'));
create index if not exists contracts_unique_bettors on contracts (((data->'uniqueBettors7Days')::int) desc);

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

create table if not exists groups (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table groups enable row level security;
drop policy if exists "public read" on groups;
create policy "public read" on groups for select using (true);
create index if not exists groups_data_gin on groups using GIN (data);

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

create table if not exists txns (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table txns enable row level security;
drop policy if exists "public read" on txns;
create policy "public read" on txns for select using (true);
create index if not exists txns_data_gin on txns using GIN (data);

create table if not exists manalinks (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table manalinks enable row level security;
drop policy if exists "public read" on manalinks;
create policy "public read" on manalinks for select using (true);
create index if not exists manalinks_data_gin on manalinks using GIN (data);

create table if not exists posts (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table posts enable row level security;
drop policy if exists "public read" on posts;
create policy "public read" on posts for select using (true);
create index if not exists posts_data_gin on posts using GIN (data);

create table if not exists test (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table test enable row level security;
drop policy if exists "public read" on test;
create policy "public read" on test for select using (true);
create index if not exists test_data_gin on test using GIN (data);

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

begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
  alter publication supabase_realtime add table users;
  alter publication supabase_realtime add table user_follows;
  alter publication supabase_realtime add table user_reactions;
  alter publication supabase_realtime add table user_events;
  alter publication supabase_realtime add table user_seen_markets;
  alter publication supabase_realtime add table contracts;
  alter publication supabase_realtime add table contract_answers;
  alter publication supabase_realtime add table contract_bets;
  alter publication supabase_realtime add table contract_comments;
  alter publication supabase_realtime add table contract_follows;
  alter publication supabase_realtime add table contract_liquidity;
  alter publication supabase_realtime add table groups;
  alter publication supabase_realtime add table group_contracts;
  alter publication supabase_realtime add table group_members;
  alter publication supabase_realtime add table txns;
  alter publication supabase_realtime add table manalinks;
  alter publication supabase_realtime add table posts;
  alter publication supabase_realtime add table test;
  alter publication supabase_realtime add table user_portfolio_history;
  alter publication supabase_realtime add table user_contract_metrics;
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
    when 'user_portfolio_history' then cast(('user_id', 'portfolio_id') as table_spec)
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

/**************************************************/
/* 3. stuff that has nothing to do with firestore */
/**************************************************/

-- Get the dot product of two vectors stored as rows in two tables.
create or replace function dot(
  urf user_recommendation_features,
  crf contract_recommendation_features
) returns real
immutable parallel safe
language sql as $$
  select  round(
    (
      urf.f0 * crf.f0 +
      urf.f1 * crf.f1 +
      urf.f2 * crf.f2 +
      urf.f3 * crf.f3 +
      urf.f4 * crf.f4
    ) * 10000) / 10000;
$$;

create or replace function calculate_distance(row1 contract_recommendation_features, row2 contract_recommendation_features)
    returns float
    language sql
    immutable parallel safe
as $$
select sqrt((row1.f0 - row2.f0)^2 +
            (row1.f1 - row2.f1)^2 +
            (row1.f2 - row2.f2)^2 +
            (row1.f3 - row2.f3)^2 +
            (row1.f4 - row2.f4)^2)
$$;

create or replace function recently_liked_contract_counts(since bigint)
returns table (contract_id text, n int)
immutable parallel safe
language sql
as $$
  select data->>'contentId' as contract_id, count(*) as n
  from user_reactions
  where data->>'contentType' = 'contract'
  and data->>'createdTime' > since::text
  group by contract_id
$$;

-- Use cached tables of user and contract features to computed the top scoring
-- markets for a user.
create or replace function get_recommended_contract_scores(uid text)
returns table (contract_id text, score real)
immutable parallel safe
language sql
as $$
  select crf.contract_id, dot(urf, crf) as score
  from user_recommendation_features as urf
  cross join contract_recommendation_features as crf
  where user_id = uid
  order by score desc
$$;

create or replace function get_recommended_contract_scores_unseen(uid text)
returns table (contract_id text, score real)
immutable parallel safe
language sql
as $$
  select crf.contract_id, coalesce(dot(urf, crf) * crf.freshness_score, 0.0) as score
  from user_recommendation_features as urf
  cross join contract_recommendation_features as crf
  where user_id = uid
  -- That has not been viewed.
  and not exists (
    select 1 from user_events
    where user_events.user_id = uid
    and user_events.data->>'name' = 'view market'
    and user_events.data->>'contractId' = crf.contract_id
  )
  -- That has not been swiped on.
    and not exists (
    select 1 from user_seen_markets
    where user_seen_markets.user_id = uid
    and user_seen_markets.contract_id = crf.contract_id
  )
  -- That has not been viewed as a card recently.
  and not exists (
    select 1 from user_events
    where user_events.user_id = uid
    and user_events.data->>'name' = 'view market card'
    and user_events.data->>'contractId' = crf.contract_id
    and (user_events.data->'timestamp')::bigint > (extract(epoch from (now() - interval '1 day')) * 1000)::bigint
  )
  order by score desc
$$;

create or replace function get_recommended_contracts_by_score_excluding(uid text, count int, excluded_contract_ids text[])
returns table (data jsonb, score real)
immutable parallel safe
language sql
as $$
  select data, score
  from get_recommended_contract_scores_unseen(uid)
  left join contracts
  on contracts.id = contract_id
  where is_valid_contract(data)
  and data->>'outcomeType' = 'BINARY'
  -- Not in the list of contracts to exclude.
  and not exists (
    select 1 from unnest(excluded_contract_ids) as w
    where w = contract_id
  )
  limit count
$$;
create or replace function get_recommended_contracts(uid text, n int, excluded_contract_ids text[])
  returns setof jsonb
  language plpgsql
as $$ begin
  create temp table your_recs on commit drop as (
    select * from get_recommended_contracts_by_score_excluding(uid, n, excluded_contract_ids)
  );
  if (select count(*) from your_recs) = n then
    return query select data from your_recs;
  else
    -- Default recommendations from this particular user if none for you.
    return query (
      select data from your_recs union all
      select data from get_recommended_contracts_by_score_excluding('Nm2QY6MmdnOu1HJUBcoG2OV2dQF2', n, excluded_contract_ids)
      limit n
    );
  end if;
end $$;

create or replace function get_time()
    returns bigint
    language sql
    stable parallel safe
as $$
select (extract(epoch from now()) * 1000)::bigint;
$$;

create or replace function is_valid_contract(data jsonb)
    returns boolean
    stable parallel safe
as $$
select not (data->>'isResolved')::boolean
       and (data->>'visibility') != 'unlisted'
       and (data->>'closeTime')::bigint > extract(epoch from now() + interval '10 minutes') * 1000
$$ language sql;

create or replace function get_related_contract_ids(source_id text)
    returns table(contract_id text, distance float)
    immutable parallel safe
    language sql
as $$
with target_contract as (
    select *
    from contract_recommendation_features
    where contract_id = source_id
)
select crf.contract_id, calculate_distance(crf, target_contract) as distance
from contract_recommendation_features as crf, target_contract
where crf.contract_id != target_contract.contract_id
order by distance
$$;

create or replace function get_related_contracts(cid text, lim int, start int)
    returns JSONB[]
    immutable parallel safe
    language sql
as $$
select array_agg(data) from (
  select data
  from get_related_contract_ids(cid)
    left join contracts
    on contracts.id = contract_id
    where is_valid_contract(data)
  limit lim
  offset start
  ) as rel_contracts
$$;

create or replace function search_contracts_by_group_slugs(group_slugs text[], lim int, start int)
    returns jsonb[]
    immutable parallel safe
    language sql
as $$
select array_agg(data) from (
    select data
    from contracts
    where data->'groupSlugs' ?| group_slugs
    and is_valid_contract(data)
    order by (data->'uniqueBettors7Days')::int desc, data->'slug'
    offset start limit lim
    ) as search_contracts
$$;

create or replace function search_contracts_by_group_slugs_for_creator(creator_id text,group_slugs text[], lim int, start int)
    returns jsonb[]
    immutable parallel safe
    language sql
as $$
select array_agg(data) from (
    select data
    from contracts
    where data->'groupSlugs' ?| group_slugs
      and is_valid_contract(data)
      and data->>'creatorId' = creator_id
    order by (data->'uniqueBettors7Days')::int desc, data->'slug'
    offset start limit lim
) as search_contracts
$$;


create or replace function get_contract_metrics_with_contracts(uid text, count int, start int)
    returns table(contract_id text, metrics jsonb, contract jsonb)
    immutable parallel safe
    language sql
as $$
select ucm.contract_id, ucm.data as metrics, c.data as contract
from user_contract_metrics as ucm
join contracts as c on c.id = ucm.contract_id
where ucm.user_id = uid and ucm.data->'lastBetTime' is not null
order by ((ucm.data)->'lastBetTime')::bigint desc
offset start
limit count
$$;

create or replace function get_open_limit_bets_with_contracts(uid text, count int)
    returns table(contract_id text, bets jsonb[], contract jsonb)
    immutable parallel safe
    language sql
as $$;
select contract_id, bets.data as bets, contracts.data as contracts
from (
         select contract_id, array_agg(data order by (data->>'createdTime') desc) as data from contract_bets
         where (data->>'userId') = uid and
                 (data->>'isFilled')::boolean = false and
                 (data->>'isCancelled')::boolean = false
         group by contract_id
     ) as bets
 join contracts
 on contracts.id = bets.contract_id
limit count
$$;


create or replace view group_role as(
  select member_id, 
    gp.id as group_id,
    gp.data as group_data,
    gp.data ->> 'name' as group_name,
    gp.data ->> 'slug' as group_slug,
    gp.data ->> 'creatorId' as creator_id,
    users.data ->> 'name' as name,
    users.data ->> 'username' as username,
    users.data ->> 'avatarUrl' as avatar_url,
    (select 
      CASE
      WHEN (gp.data ->> 'creatorId')::text = member_id THEN 'admin'
      ELSE (gm.data ->> 'role')
      END
    ) as role,
    (gm.data ->> 'createdTime')::bigint as createdTime
  from (group_members gm join groups gp on gp.id = gm.group_id) join users on users.id = gm.member_id
) 

create or replace view user_groups as(
select 
users.id as id, 
users.data->>'name' as name, 
users.data->>'username' as username, 
users.data->>'avatarUrl' as avatarurl, 
(users.data->>'followerCountCached')::integer as follower_count,
user_groups.groups as groups 
from (users left join
(select member_id, array_agg(group_id) as groups from group_members group by member_id) user_groups 
on users.id=user_groups.member_id))

create or replace function get_contracts_by_creator_ids(creator_ids text[], created_time bigint)
returns table(creator_id text, contracts jsonb)
    immutable parallel safe
    language sql
as $$
    select data->>'creatorId' as creator_id, jsonb_agg(data) as contracts
    from contracts
    where data->>'creatorId' = any(creator_ids)
    and (data->>'createdTime')::bigint > created_time
    group by creator_id;
$$;


create table if not exists discord_users (
    discord_user_id text not null,
    api_key text not null,
    primary key(discord_user_id)
);
alter table discord_users enable row level security;

create table if not exists discord_messages_markets (
    message_id text not null,
    market_id text not null,
    market_slug text not null,
    channel_id text not null,
    last_updated_thread_time bigint,
    thread_id text,
    primary key(message_id)
);
alter table discord_messages_markets enable row level security;

create or replace function get_your_contract_ids(uid text)
returns table (contract_id text)
immutable parallel safe
language sql
as $$
  with your_liked_contracts as (
    select (data->>'contentId') as contract_id
    from user_reactions
    where user_id = uid
  ), your_followed_contracts as (
    select contract_id
    from contract_follows
    where follow_id = uid
  )
  select contract_id from your_liked_contracts
  union
  select contract_id from your_followed_contracts
$$;

create or replace function get_your_daily_changed_contracts(uid text, n int, start int)
returns table (data jsonb, daily_score real)
immutable parallel safe
language sql
as $$
  select data, coalesce((data->>'dailyScore')::real, 0.0) as daily_score
  from get_your_contract_ids(uid)
  left join contracts
  on contracts.id = contract_id
  and data->>'outcomeType' = 'BINARY'
  order by daily_score desc
  limit n
  offset start
$$;

create or replace function get_your_trending_contracts(uid text, n int, start int)
returns table (data jsonb, score real)
immutable parallel safe
language sql
as $$
  select data, coalesce((data->>'popularityScore')::real, 0.0) as score
  from get_your_contract_ids(uid)
  left join contracts
  on contracts.id = contract_id
  where is_valid_contract(data)
  and data->>'outcomeType' = 'BINARY'
  order by score desc
  limit n
  offset start
$$;

