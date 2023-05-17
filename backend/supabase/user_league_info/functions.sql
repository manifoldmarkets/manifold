create
or replace function get_user_league_info_from_username (this_season int4, this_username text) returns setof user_league_info stable parallel safe language sql as $$
select user_league_info.* 
from user_league_info 
join users
on users.id = user_league_info.user_id
where season = this_season
and users.username = this_username
 $$;
