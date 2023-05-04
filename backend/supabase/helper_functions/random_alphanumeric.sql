create
or replace function random_alphanumeric (length integer) returns text as $$
DECLARE
  result TEXT;
BEGIN
  WITH alphanum AS (
    SELECT ARRAY['0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
                 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
                 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'] AS chars
  )
  SELECT array_to_string(ARRAY (
    SELECT alphanum.chars[1 + floor(random() * 62)::integer]
    FROM alphanum, generate_series(1, length)
  ), '') INTO result;

  RETURN result;
END;
$$ language plpgsql;
