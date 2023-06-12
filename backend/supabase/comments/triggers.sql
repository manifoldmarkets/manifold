create
or replace function comment_populate_cols () returns trigger language plpgsql as $$ begin 
    if new.data is not null then new.visibility := (new.data)->>'visibility';
    new.user_id := (new.data)->>'userId';
    new.created_time := case
  when new.data ? 'createdTime' then millis_to_ts(((new.data)->>'createdTime')::bigint)
  else null
  end;
    end if;
    return new;
end $$;

create
or replace function post_comment_populate_cols () returns trigger language plpgsql as $$ begin
  if new.data is not null then
    new.visibility := (new.data)->>'visibility';
    new.user_id := (new.data)->>'userId';
  end if;
  return new;
end $$;

create trigger comment_populate before insert
or
update on contract_comments for each row
execute function comment_populate_cols ();

create trigger post_comment_populate before insert
or
update on post_comments for each row
execute function post_comment_populate_cols ();
