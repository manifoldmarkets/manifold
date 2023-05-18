create
or replace function group_populate_cols () returns trigger language plpgsql as $$ begin 
    if new.data is not null then 
    new.privacy_status := (new.data)->>'privacyStatus';
    new.slug := (new.data)->>'slug';
    new.name := (new.data)->>'name';
    new.creator_id := (new.data)->>'creatorId';
    new.total_members := (new.data)->>'totalMembers';
    end if;
    return new;
end $$;

create trigger group_populate before insert
or
update on groups for each row
execute function group_populate_cols ();
