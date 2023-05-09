create
or replace function get_last_week_long_link (this_group_id text) returns text as $$
    SELECT id
    FROM group_invites
    WHERE (
            group_id = this_group_id
            -- just gets the last default link if it was generated less than 12 hours ago
            and duration = '1 week'::interval
            and max_uses is null
            and created_time > (now() - '12 hours'::interval)
        )
    order by created_time desc
    LIMIT 1
$$ language sql immutable parallel SAFE;
