CREATE OR REPLACE FUNCTION get_rating(user_id TEXT)
RETURNS TABLE (count BIGINT, rating NUMERIC)
IMMUTABLE PARALLEL SAFE LANGUAGE SQL
AS $$
  WITH 
  -- find average of each user's reviews
  rating_counts AS (
    SELECT AVG(rating) AS avg_rating
    FROM reviews
    WHERE vendor_id = user_id
    GROUP BY reviewer_id
  ), 
  
  positive_counts AS (
    SELECT 5 + COUNT(*) AS count FROM rating_counts WHERE avg_rating >= 4.0
  ), 
  
  negative_counts AS (
    SELECT 2 * COUNT(*) AS count FROM rating_counts WHERE avg_rating < 4.0
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

  SELECT rating.count - 5, -- subtract added positive reviews
         -- squash with sigmoid, multiply by 5
         5 / (1 + POW(2.71828, -10*(rating.rating-0.5))) AS rating
  FROM rating;
$$;