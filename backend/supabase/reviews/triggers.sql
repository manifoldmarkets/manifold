create
or replace function update_review_avg () returns trigger language plpgsql as $$ begin 
  update user_avg_rating set avg_rating = (
    select avg(rating) from reviews
    where user_id = new.vendor_id
  ) where user_id = new.vendor_id;

  if not found then
    insert into user_avg_rating (user_id, avg_rating)
    values (new.vendor_id, new.rating);
  end if;

end $$;

create trigger group_populate before insert
or
update on groups for each row
execute function group_populate_cols ();
