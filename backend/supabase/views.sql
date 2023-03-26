create or replace view public_open_contracts as (
  select * from contracts
  where not (data->>'isResolved')::boolean
       and (data->>'visibility') != 'unlisted'
       and (data->>'closeTime')::bigint > ts_to_millis(now() + interval '10 minutes')
);

create or replace view trending_contracts as (
  select * from public_open_contracts
  order by (data->>'popularityScore')::numeric desc
);
       
create or replace view user_contract_distance as (
  select
    user_id,
    contract_id,
    user_embeddings.interest_embedding <=> contract_embeddings.embedding as distance
  from user_embeddings
  cross join contract_embeddings
);

create or replace view user_trending_contract as (
  select
    user_id,
    user_contract_distance.contract_id,
    distance,
    freshness_score
  from user_contract_distance
  -- For getting the freshness score.
  join contract_recommendation_features on contract_recommendation_features.contract_id = user_contract_distance.contract_id
  join public_open_contracts on public_open_contracts.id = user_contract_distance.contract_id
  -- Experimentally determined threshold.
  where distance < 0.14
  order by freshness_score desc

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
