create
or replace function get_non_empty_private_message_channel_ids (p_user_id text, p_limit integer default null) returns table (id bigint) as $$
BEGIN
    RETURN QUERY
    SELECT pumc.id
    FROM private_user_message_channels pumc
    JOIN private_user_message_channel_members pumcm ON pumcm.channel_id = pumc.id 
    WHERE pumcm.user_id = p_user_id
    AND EXISTS (
        SELECT 1 
        FROM private_user_messages
        WHERE pumc.id = private_user_messages.channel_id
    )
    ORDER BY pumc.last_updated_time DESC
    LIMIT p_limit;
END;
$$ language plpgsql;
