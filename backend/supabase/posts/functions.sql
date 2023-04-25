create
or replace function can_access_private_post (this_post_id text, this_member_id text) returns boolean immutable parallel SAFE language sql as $$
select exists (
    select 1
    from posts
    join group_members on group_members.group_id = posts.group_id
    where posts.id = this_post_id
      and group_members.member_id = this_member_id
) $$;
