create
or replace function users_populate_cols () returns trigger language plpgsql as $$ begin
    if new.data is not null then 
      new.name := (new.data)->>'name';
      new.username := (new.data)->>'username';
    end if;
    return new;
end $$;

create trigger users_popuate before insert
or
update on users for each row
execute function users_populate_cols ();
