create table if not exists
  user_reactions (
    user_id text not null,
    reaction_id text not null default random_alphanumeric (12),
    content_id text,
    content_type text,
    content_owner_id text,
    created_time timestamptz not null default now(),
    -- deprecated
    data jsonb,
    fs_updated_time timestamp not null,
    primary key (user_id, reaction_id)
  );

alter table user_reactions enable row level security;

drop policy if exists "public read" on user_reactions;

create policy "public read" on user_reactions for
select
  using (true);

create index if not exists user_reactions_content_id_raw on user_reactions (content_id);

create
or replace function user_reactions_populate_cols () returns trigger language plpgsql as $$
begin
  if new.data is not null then
    new.content_id := (new.data) ->> 'contentId';
    new.content_type := (new.data) ->> 'contentType';
    new.content_owner_id := (new.data) ->> 'contentOwnerId';
    new.created_time :=
      case when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint) else null end;
  end if;
  return new;
end
$$;

create trigger user_reactions_populate before insert
or
update on user_reactions for each row
execute function user_reactions_populate_cols ();
