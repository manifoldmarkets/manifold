alter table contract_comments
add column visibility text;

create
or replace function comment_populate_cols () returns trigger language plpgsql as $$ begin 
    if new.data is not null then new.visibility := (new.data)->>'visibility';
    end if;
    return new;
end $$;

create trigger comment_populate before insert
or
update on contract_comments for each row
execute function comment_populate_cols ();

update contract_comments
set
  fs_updated_time = fs_updated_time
alter table post_comments
add column visibility text;

create trigger post_comment_populate before insert
or
update on post_comments for each row
execute function comment_populate_cols ();

drop trigger post_comment_populate on post_comments;

update post_comments
set
  fs_updated_time = fs_updated_time
