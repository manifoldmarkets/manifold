alter table group_members add role text;

alter table group_members add created_time timestamptz;

create
or replace function group_member_populate_cols () returns trigger language plpgsql as $$ begin 
    if new.data is not null then 
    new.role := (new.data)->>'role';
    new.created_time := case
        when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint)
        else null
        end;
    end if;
    return new;
end $$;

create trigger group_members_populate before insert
or
update on group_members for each row
execute function group_member_populate_cols ();