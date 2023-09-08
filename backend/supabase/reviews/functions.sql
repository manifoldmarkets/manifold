create
or replace function get_rating (user_id text) returns table (count bigint, rating numeric) immutable parallel SAFE language sql as $$
  WITH

  -- find average of each user's reviews
  avg_ratings AS (
    SELECT AVG(rating) AS avg_rating
    FROM reviews
    WHERE vendor_id = user_id
    GROUP BY reviewer_id
  ),

  total_count AS (
    SELECT COUNT(*) AS count
    FROM reviews
    WHERE vendor_id = user_id
  ),

  positive_counts AS (
    SELECT 5 + COUNT(*) AS count FROM avg_ratings WHERE avg_rating >= 4.0
  ),

  negative_counts AS (
    SELECT COUNT(*) AS count FROM avg_ratings WHERE avg_rating < 4.0
  ),

  -- calculate lower bound of 95th percentile confidence interval: https://www.evanmiller.org/how-not-to-sort-by-average-rating.html
  rating AS (
    SELECT (positive_counts.count + negative_counts.count) AS count,
       (
        (positive_counts.count + 1.9208) / (positive_counts.count + negative_counts.count) -
        1.96 * SQRT((positive_counts.count * negative_counts.count) / (positive_counts.count + negative_counts.count) + 0.9604) /
        (positive_counts.count + negative_counts.count)
      ) / (1 + 3.8416 / (positive_counts.count + negative_counts.count)) AS rating
    FROM positive_counts, negative_counts
  )

  SELECT total_count.count                               as count,
         -- squash with sigmoid, multiply by 5
         5 / (1 + POW(2.71828, -10*(rating.rating-0.5))) AS rating
  FROM total_count,rating;
$$;

create
or replace function get_rating_info (p_vendor_id text) returns table (avg_rating numeric, count bigint) language plpgsql stable as $$
BEGIN
  RETURN QUERY
    SELECT AVG(rating) AS avg_rating, COUNT(rating) AS count
    FROM reviews
    WHERE vendor_id = p_vendor_id;
END;
$$;
