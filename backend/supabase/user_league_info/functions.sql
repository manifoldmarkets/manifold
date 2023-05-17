create
or replace function get_user_league_info_from_username (this_season int4, this_username text) returns table (
  user_id text,
  season int4,
  division int4,
  cohort text,
  mana_earned numeric,
  created_time timestamptz,
  rank int4
) stable parallel safe language sql as $$
select user_league_info.* 
from user_league_info 
join users
on users.id = user_league_info.user_id
where season = this_season
and users.username = this_username
 $$;
