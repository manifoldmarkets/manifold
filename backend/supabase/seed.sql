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

/* multi-column GIN indexes */
create extension if not exists btree_gin;

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

begin;

drop publication if exists supabase_realtime;

create publication supabase_realtime;

alter publication supabase_realtime
add table group_contracts;

alter publication supabase_realtime
add table group_members;

alter publication supabase_realtime
add table user_follows;

alter publication supabase_realtime
add table chart_annotations;

commit;

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
