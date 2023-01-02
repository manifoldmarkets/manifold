/* GIN trigram indexes */
create extension pg_trgm;

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
create index concurrently if not exists users_follower_count_cached on users (to_jsonb(data->'followerCountCached') desc)

create table if not exists user_followers (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table user_followers enable row level security;
drop policy if exists "public read" on user_followers;
create policy "public read" on user_followers for select using (true);
create index concurrently if not exists user_followers_data_gin on user_followers using GIN (data);

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
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table contract_answers enable row level security;
drop policy if exists "public read" on contract_answers;
create policy "public read" on contract_answers for select using (true);
create index concurrently if not exists contract_answers_data_gin on contract_answers using GIN (data);

create table if not exists contract_bets (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table contract_bets enable row level security;
drop policy if exists "public read" on contract_bets;
create policy "public read" on contract_bets for select using (true);
create index concurrently if not exists contract_bets_data_gin on contract_bets using GIN (data);

create table if not exists contract_comments (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table contract_comments enable row level security;
drop policy if exists "public read" on contract_comments;
create policy "public read" on contract_comments for select using (true);
create index concurrently if not exists contract_comments_data_gin on contract_comments using GIN (data);

create table if not exists contract_follows (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table contract_follows enable row level security;
drop policy if exists "public read" on contract_follows;
create policy "public read" on contract_follows for select using (true);
create index concurrently if not exists contract_follows_data_gin on contract_follows using GIN (data);

create table if not exists contract_liquidity (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
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
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
);
alter table group_contracts enable row level security;
drop policy if exists "public read" on group_contracts;
create policy "public read" on group_contracts for select using (true);
create index concurrently if not exists group_contracts_data_gin on group_contracts using GIN (data);

create table if not exists group_members (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
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
  alter publication supabase_realtime add table user_followers;
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
  doc_id text not null,
  data jsonb null, /* can be null on deletes */
  ts timestamp not null
);
alter table incoming_writes enable row level security;
create index if not exists incoming_writes_ts on incoming_writes (ts desc);

create or replace function get_document_table(doc_kind text)
  returns text
  language plpgsql
as
$$
begin
  return case doc_kind
    when 'user' then 'users'
    when 'userFollower' then 'user_followers'
    when 'contract' then 'contracts'
    when 'contractAnswer' then 'contract_answers'
    when 'contractBet' then 'contract_bets'
    when 'contractComment' then 'contract_comments'
    when 'contractFollow' then 'contract_follows'
    when 'contractLiquidity' then 'contract_liquidity'
    when 'group' then 'groups'
    when 'groupContract' then 'group_contracts'
    when 'groupMember' then 'group_members'
    when 'txn' then 'txns'
    when 'manalink' then 'manalinks'
    when 'post' then 'posts'
    when 'test' then 'test'
    else null
  end;
end
$$;

create or replace function replicate_writes_process_one(r incoming_writes)
  returns boolean
  language plpgsql
as
$$
declare dest_table text;
begin
  dest_table = get_document_table(r.doc_kind);
  if dest_table = null then
    raise warning 'Invalid document kind.';
    return false;
  end if;
  if r.write_kind = 'create' or r.write_kind = 'update' then
    execute format(
      'insert into %1$I (id, data, fs_updated_time) values (%2$L, %3$L, %4$L)
       on conflict (id) do update set data = %3$L, fs_updated_time = %4$L
       where %1$I.fs_updated_time <= %4$L
       returning id;',
      dest_table, r.doc_id, r.data, r.ts
    );
  elsif r.write_kind = 'delete' then
    execute format(
      'delete from %1$I where id = %2$L and fs_updated_time <= %3$L',
      dest_table, r.doc_id, r.ts
    );
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
  order by r.doc_id;
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
  order by r.doc_id;
  return null;
end
$$;

drop trigger if exists replicate_writes on incoming_writes;
create trigger replicate_writes
after insert on incoming_writes
referencing new table as new_table
for each statement
execute function replicate_writes_process_new();
