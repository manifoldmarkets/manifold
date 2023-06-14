-- Keep total members up to date
create
or replace function increment_group_members () returns trigger language plpgsql as $$ begin 
    update groups set total_members = total_members + 1 where id = new.group_id;
    return new;
end $$;

create trigger increment_group
after insert on group_members for each row
execute procedure increment_group_members ();

create
or replace function decrement_group_members () returns trigger language plpgsql as $$ begin 
    update groups set total_members = total_members - 1 where id = old.group_id;
    return old;
end $$;

create trigger decrement_group before delete on group_members for each row
execute procedure decrement_group_members ();
