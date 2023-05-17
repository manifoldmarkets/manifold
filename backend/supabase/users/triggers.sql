alter table users
add column username text;

create
or replace function users_populate_cols () returns trigger language plpgsql as $$ begin 
    if new.data is not null then 
    new.username := (new.data)->>'username';
    end if;
    return new;
end $$;


create trigger users_populate before insert
or
update on users for each row
execute function users_populate_cols ();

update users
set
  fs_updated_time = fs_updated_time;