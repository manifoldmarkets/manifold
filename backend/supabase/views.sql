create or replace view public_open_contracts as (
  select * from contracts
  where not (data->>'isResolved')::boolean
       and (data->>'visibility') != 'unlisted'
       and (data->>'closeTime')::bigint > ts_to_millis(now() + interval '10 minutes')
);

create or replace view user_similar_contracts as (
  with user_and_contract_embeddings as (
    select * from user_embeddings
    cross join contract_embeddings
  )
  select user_id, contract_id, 1 - (embedding <=> interest_embedding) as similarity
  from user_and_contract_embeddings
  order by similarity desc
)
       
create or replace view group_role as (
  select member_id,
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
  from (group_members gm join groups gp on gp.id = gm.group_id) join users on users.id = gm.member_id
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
