alter table groups
add column privacy_status text,
add column slug text,
add column name text,
add column creator_id text;

create
or replace function group_populate_cols () returns trigger language plpgsql as $$ begin 
    if new.data is not null then 
    new.privacy_status := (new.data)->>'privacyStatus';
    new.slug := (new.data)->>'slug';
    new.name := (new.data)->>'name';
    new.creator_id := (new.data)->>'creatorId';
    end if;
    return new;
end $$;

create trigger group_populate before insert
or
update on groups for each row
execute function group_populate_cols ();

update groups
set
  fs_updated_time = fs_updated_time;
