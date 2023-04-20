create or replace view
  public_open_contracts as (
    select
      *
    from
      contracts
    where
      resolution_time is null
      and visibility = 'public'
      and close_time > now() + interval '10 minutes'
  );

create or replace view
  public_contracts as (
    select
      *
    from
      contracts
    where
      visibility = 'public'
  );

create or replace view
  listed_open_contracts as (
    select
      *
    from
      contracts
    where
      resolution_time is null --    row level security prevents the 'private' contracts from being returned
      and visibility != 'unlisted'
      and close_time > now() + interval '10 minutes'
  );

create or replace view
  trending_contracts as (
    select
      *
    from
      listed_open_contracts
    where
      listed_open_contracts.popularity_score > 0
    order by
      popularity_score desc
  );

create or replace view
  contract_distance as (
    select
      ce1.contract_id as id1,
      ce2.contract_id as id2,
      ce1.embedding <= > ce2.embedding as distance
    from
      contract_embeddings ce1
      cross join contract_embeddings ce2
    order by
      distance
  );

create or replace view
  related_contracts as (
    select
      id1 as from_contract_id,
      id2 as contract_id,
      distance,
      data
    from
      contract_distance
      join listed_open_contracts on id = id2
    where
      id1 != id2
  );

create or replace view
  user_contract_distance as (
    select
      user_id,
      contract_id,
      user_embeddings.interest_embedding <= > contract_embeddings.embedding as distance
    from
      user_embeddings
      cross join contract_embeddings
  );

create or replace view
  user_trending_contract as (
    select
      user_contract_distance.user_id,
      user_contract_distance.contract_id,
      distance,
      public_open_contracts.popularity_score,
      public_open_contracts.created_time,
      public_open_contracts.close_time
    from
      user_contract_distance
      join public_open_contracts on public_open_contracts.id = user_contract_distance.contract_id
    where
      public_open_contracts.popularity_score > 0
    order by
      popularity_score desc
  );

create or replace view
  group_role as (
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
      (
        select
          case
            when (gp.data ->> 'creatorId')::text = member_id then 'admin'
            else (gm.data ->> 'role')
          end
      ) as role,
      (gm.data ->> 'createdTime')::bigint as createdTime
    from
      (
        group_members gm
        join groups gp on gp.id = gm.group_id
      )
      join users on users.id = gm.member_id
  );

create or replace view
  user_groups as (
    select
      users.id as id,
      users.data ->> 'name' as name,
      users.data ->> 'username' as username,
      users.data ->> 'avatarUrl' as avatarurl,
      (users.data ->> 'followerCountCached')::integer as follower_count,
      user_groups.groups as groups
    from
      (
        users
        left join (
          select
            member_id,
            array_agg(group_id) as groups
          from
            group_members
          group by
            member_id
        ) user_groups on users.id = user_groups.member_id
      )
  );

create or replace view
  contracts_rbac as
select
  *
from
  contracts
where
  contracts.visibility = 'public'
  or contracts.visibility = 'unlisted'
  or (
    contracts.visibility = 'private'
    and (
      can_access_private_contract (contracts.id, firebase_uid ())
    )
  );

create or replace view
  groups_rbac as
select
  *
from
  groups
where
  groups.data ->> 'privacyStatus' <> 'private'
  or (
    (
      exists (
        select
          1
        from
          group_members
        where
          (
            (group_members.group_id = groups.id)
            and (group_members.member_id = firebase_uid ())
          )
      )
    )
  );

create view
  user_referrals as
select
  id,
  data,
  total_referrals,
  rank() over (
    order by
      total_referrals desc
  ) as rank
from
  (
    select
      referrer.id as id,
      referrer.data as data,
      count(*) as total_referrals
    from
      users as referred
      join users as referrer on referrer.data ->> 'id' = referred.data ->> 'referredByUserId'
    where
      referred.data ->> 'referredByUserId' is not null
    group by
      referrer.id
  ) subquery
order by
  total_referrals desc;

create view
  user_referrals_profit as
select
  id,
  data,
  total_referrals,
  total_referred_profit,
  rank() over (
    order by
      total_referrals desc
  ) as rank
from
  (
    select
      referrer.id as id,
      referrer.data as data,
      count(*) as total_referrals,
      sum(
        (referred.data -> 'profitCached' ->> 'allTime')::numeric
      ) as total_referred_profit
    from
      users as referred
      join users as referrer on referrer.data ->> 'id' = referred.data ->> 'referredByUserId'
    where
      referred.data ->> 'referredByUserId' is not null
    group by
      referrer.id
  ) subquery
order by
  total_referrals desc;

create or replace view
  public_contract_bets as (
  select
    *
  from
    contract_bets
  where
      visibility = 'public'
  );
