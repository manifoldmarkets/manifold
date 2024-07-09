create or replace view
  public_contracts as (
    select
      *
    from
      contracts
    where
      visibility = 'public'
  );

drop view if exists group_role;

create view
  group_role as (
    select
      member_id,
      gp.id as group_id,
      gp.name as group_name,
      gp.slug as group_slug,
      gp.creator_id as creator_id,
      gp.total_members as total_members,
      users.name as name,
      users.username as username,
      users.data ->> 'avatarUrl' as avatar_url,
      gm.role as role,
      ts_to_millis (gm.created_time) as createdTime,
      gp.privacy_status as privacy_status
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
      users.name as name,
      users.username as username,
      users.data ->> 'avatarUrl' as avatarurl,
      coalesce(user_groups.groups, '{}') as groups
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

create or replace view
  user_league_info as (
    select
      *,
      (
        row_number() over (
          partition by
            season,
            division,
            cohort
          order by
            mana_earned desc
        )::int
      ) as rank
    from
      leagues
  );
