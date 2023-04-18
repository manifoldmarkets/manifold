create
or replace function is_group_member (this_group_id text, this_user_id text) returns boolean immutable parallel safe language sql as $$
select EXISTS (
        SELECT 1
        FROM group_members
        WHERE (
                group_id = this_group_id
                and member_id = this_user_id
            )
    ) $$;
