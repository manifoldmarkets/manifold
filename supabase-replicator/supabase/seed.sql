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

create table if not exists users (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table users enable row level security;
drop policy if exists "public read" on users;
create policy "public read" on users for select using (true);
create index concurrently if not exists users_data_gin on users using GIN (data);

/* indexes supporting @-mention autocomplete */
create index concurrently if not exists users_name_gin on users using GIN ((data->>'name') gin_trgm_ops);
create index concurrently if not exists users_username_gin on users using GIN ((data->>'username') gin_trgm_ops);
create index concurrently if not exists users_follower_count_cached on users ((to_jsonb(data->'followerCountCached')) desc);

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
create index concurrently if not exists user_follows_data_gin on user_follows using GIN (data);

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
create index concurrently if not exists user_reactions_data_gin on user_reactions using GIN (data);

create table if not exists contracts (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table contracts enable row level security;
drop policy if exists "public read" on contracts;
create policy "public read" on contracts for select using (true);
create index concurrently if not exists contracts_data_gin on contracts using GIN (data);

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
create index concurrently if not exists contract_answers_data_gin on contract_answers using GIN (data);

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
create index concurrently if not exists contract_bets_data_gin on contract_bets using GIN (data);

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
create index concurrently if not exists contract_comments_data_gin on contract_comments using GIN (data);

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
create index concurrently if not exists contract_follows_data_gin on contract_follows using GIN (data);

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
create index concurrently if not exists contract_liquidity_data_gin on contract_liquidity using GIN (data);

create table if not exists groups (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table groups enable row level security;
drop policy if exists "public read" on groups;
create policy "public read" on groups for select using (true);
create index concurrently if not exists groups_data_gin on groups using GIN (data);

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
create index concurrently if not exists group_contracts_data_gin on group_contracts using GIN (data);

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
create index concurrently if not exists group_members_data_gin on group_members using GIN (data);

create table if not exists txns (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table txns enable row level security;
drop policy if exists "public read" on txns;
create policy "public read" on txns for select using (true);
create index concurrently if not exists txns_data_gin on txns using GIN (data);

create table if not exists manalinks (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table manalinks enable row level security;
drop policy if exists "public read" on manalinks;
create policy "public read" on manalinks for select using (true);
create index concurrently if not exists manalinks_data_gin on manalinks using GIN (data);

create table if not exists posts (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table posts enable row level security;
drop policy if exists "public read" on posts;
create policy "public read" on posts for select using (true);
create index concurrently if not exists posts_data_gin on posts using GIN (data);

create table if not exists test (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table test enable row level security;
drop policy if exists "public read" on test;
create policy "public read" on test for select using (true);
create index concurrently if not exists test_data_gin on test using GIN (data);

begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
  alter publication supabase_realtime add table users;
  alter publication supabase_realtime add table user_follows;
  alter publication supabase_realtime add table user_reactions;
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
commit;

create table if not exists incoming_writes (
  id bigint generated always as identity primary key,
  event_id text null, /* can be null for writes generated by manual import */
  doc_kind text not null,
  write_kind text not null,
  parent_id text null, /* null for top-level collections */
  doc_id text not null,
  data jsonb null, /* can be null on deletes */
  ts timestamp not null
);
alter table incoming_writes enable row level security;
create index if not exists incoming_writes_ts on incoming_writes (ts desc);

drop function if exists get_document_table_spec;
drop type if exists table_spec;
create type table_spec as (table_name text, parent_id_col_name text, id_col_name text);

create or replace function get_document_table_spec(doc_kind text)
  returns table_spec
  language plpgsql
as
$$
begin
  return case doc_kind
    when 'user' then cast(('users', null, 'id') as table_spec)
    when 'userFollow' then cast(('user_follows', 'user_id', 'follow_id') as table_spec)
    when 'userReaction' then cast(('user_reactions', 'user_id', 'reaction_id') as table_spec)
    when 'contract' then cast(('contracts', null, 'id') as table_spec)
    when 'contractAnswer' then cast(('contract_answers', 'contract_id', 'answer_id') as table_spec)
    when 'contractBet' then cast(('contract_bets', 'contract_id', 'bet_id') as table_spec)
    when 'contractComment' then cast(('contract_comments', 'contract_id', 'comment_id') as table_spec)
    when 'contractFollow' then cast(('contract_follows', 'contract_id', 'follow_id') as table_spec)
    when 'contractLiquidity' then cast(('contract_liquidity', 'contract_id', 'liquidity_id') as table_spec)
    when 'group' then cast(('groups', null, 'id') as table_spec)
    when 'groupContract' then cast(('group_contracts', 'group_id', 'contract_id') as table_spec)
    when 'groupMember' then cast(('group_members', 'group_id', 'member_id') as table_spec)
    when 'txn' then cast(('txns', null, 'id') as table_spec)
    when 'manalink' then cast(('manalinks', null, 'id') as table_spec)
    when 'post' then cast(('posts', null, 'id') as table_spec)
    when 'test' then cast(('test', null, 'id') as table_spec)
    else null
  end;
end
$$;

create or replace function replicate_writes_process_one(r incoming_writes)
  returns boolean
  language plpgsql
as
$$
declare dest_table table_spec;
begin
  dest_spec = get_document_table_spec(r.doc_kind);
  if dest_spec is null then
    raise warning 'Invalid document kind.';
    return false;
  end if;
  if r.write_kind = 'create' or r.write_kind = 'update' then
    if dest_spec.parent_id_col_name is not null then
      execute format(
        'insert into %1$I (%2$I, %3$I, data, fs_updated_time) values (%4$L, %5$L, %6$L, %7$L)
         on conflict (%2$I, %3$I) do update set data = %6$L, fs_updated_time = %7$L
         where %1$I.fs_updated_time <= %7$L;',
        dest_spec.table_name, dest_spec.parent_id_col_name, dest_spec.id_col_name,
        r.parent_id, r.doc_id, r.data, r.ts
      );
    else
      execute format(
        'insert into %1$I (%2$I, data, fs_updated_time) values (%3$L, %4$L, %5$L)
         on conflict (%2$I) do update set data = %4$L, fs_updated_time = %5$L
         where %1$I.fs_updated_time <= %5$L;',
        dest_spec.table_name, dest_spec.id_col_name,
        r.doc_id, r.data, r.ts
      );
    end if;
  elsif r.write_kind = 'delete' then
    if dest_spec.parent_id_col_name is not null then
      execute format(
        'delete from %1$I where %2$I = %4$L and %3$I = %5$L and fs_updated_time <= %6$L',
        dest_spec.table_name, dest_spec.parent_id_col_name, dest_spec.id_col_name,
        r.parent_id, r.doc_id, r.ts
      );
    else
      execute format(
        'delete from %1$I where %2$I = %3$L and fs_updated_time <= %4$L',
        dest_spec.table_name, dest_spec.id_col_name,
        r.doc_id, r.ts
      );
    end if;
  else
    raise warning 'Invalid write kind.';
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
