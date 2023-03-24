create or replace view public_open_contracts as (
  select * from contracts
  where resolution_time is null
       and visibility != 'unlisted'
       and close_time > now() + interval '10 minutes'
);

create or replace view trending_contracts as (
  select * from public_open_contracts
  order by (data->>'popularityScore')::numeric desc
);

create or replace view group_role as (
  select
    member_id,
    gp.id as group_id,
    gp.data as group_data,
    gp.data ->> 'name' as group_name,
    gp.data ->> 'slug' as group_slug,
    gp.data ->> 'creatorId' as creator_id,
    users.data ->> 'name' as name,
    users.data ->> 'username' as username,
    users.data ->> 'avatarUrl' as avatar_url,
    (select
      CASE
      WHEN (gp.data ->> 'creatorId')::text = member_id THEN 'admin'
      ELSE (gm.data ->> 'role')
      END
    ) as role,
    (gm.data ->> 'createdTime')::bigint as createdTime
  from (group_members gm join groups gp on gp.id = gm.group_id)
  join users on users.id = gm.member_id
);

create or replace view user_groups as (
  select
    users.id as id,
    users.data->>'name' as name,
    users.data->>'username' as username,
    users.data->>'avatarUrl' as avatarurl,
    (users.data->>'followerCountCached')::integer as follower_count,
    user_groups.groups as groups
  from (users left join
    (select member_id, array_agg(group_id) as groups from group_members group by member_id)
    user_groups on users.id=user_groups.member_id)
);
