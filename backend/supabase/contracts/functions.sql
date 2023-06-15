create
or replace function can_access_private_contract (this_contract_id text, this_member_id text) returns boolean parallel SAFE language sql as $$
  SELECT EXISTS (
    SELECT 1 WHERE is_private_contract_member(this_contract_id, this_member_id)

    UNION

    SELECT 1 WHERE is_admin(this_member_id)
  ) 
$$;

create
or replace function is_private_contract_member (this_contract_id text, this_member_id text) returns boolean parallel SAFE language sql as $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members
    JOIN group_contracts ON group_members.group_id = group_contracts.group_id
    WHERE group_contracts.contract_id = this_contract_id
      AND group_members.member_id = this_member_id
  ) 
$$;

create
or replace function get_user_bet_contracts (this_user_id text, this_limit integer) returns table (data JSON) immutable parallel SAFE language sql as $$
  select c.data
  from contracts c
  join user_contract_metrics ucm on c.id = ucm.contract_id
  where ucm.user_id = this_user_id
  limit this_limit;
$$;

create
or replace function get_unique_bettors_since(this_contract_id text, since bigint) returns bigint
language sql as $$
  select count(distinct user_id)
  from contract_bets
  where contract_id = this_contract_id
    and created_time >= millis_to_ts(since);
$$;