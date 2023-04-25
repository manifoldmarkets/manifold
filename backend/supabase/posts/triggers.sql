alter table posts
add column visibility text;

alter table posts
add column group_id text;

alter table posts
add column creator_id text;

alter table posts
add column created_time timestamptz;

create
or replace function post_populate_cols () returns trigger language plpgsql as $$ begin 
    if new.data is not null then 
    new.visibility := (new.data)->>'visibility';
    new.group_id := (new.data)->>'groupId';
    new.creator_id := (new.data)->>'creatorId';
    new.created_time := case
  when new.data ? 'createdTime' then millis_to_ts(((new.data)->>'createdTime')::bigint)
    else null
end;
    end if;
    return new;
end $$;

create trigger post_populate before insert
or
update on posts for each row
execute function post_populate_cols ();

update posts
set
  fs_updated_time = fs_updated_time;
