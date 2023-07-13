create
or replace function get_rating (user_id text) returns table (count bigint, rating numeric) immutable parallel safe language sql as $$
  select
    count(*) as count,
    avg(rating) as rating
  from reviews
  where vendor_id = user_id
$$;
