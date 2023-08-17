alter table manalinks
add column from_id text;

create
or replace function manalink_populate_cols () returns trigger language plpgsql as $$ begin 
    if new.data is not null then 
        new.from_id := (new.data)->>'fromId';
    end if;
    return new;
end $$;

create trigger manalinks_populate before insert
or
update on manalinks for each row
execute function manalink_populate_cols ();

update manalinks set fs_updated_time = fs_updated_time;
