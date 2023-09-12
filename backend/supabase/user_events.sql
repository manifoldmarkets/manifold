create or replace function get_user_journeys(start_time bigint)
    returns setof user_events
as $$
select ue.* from users u
                     join user_events ue on ue.user_id = u.id
where millis_to_ts(((u.data->'createdTime')::bigint)) > millis_to_ts(start_time)
  and ue.ts > millis_to_ts(start_time)
$$ language sql;
