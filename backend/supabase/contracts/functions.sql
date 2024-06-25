create
or replace function get_user_bet_contracts (this_user_id text, this_limit integer) returns table (data JSON) immutable parallel SAFE language sql as $$
  select c.data
  from contracts c
  join user_contract_metrics ucm on c.id = ucm.contract_id
  where ucm.user_id = this_user_id
  limit this_limit;
$$;

create
or replace function get_unique_bettors_since (this_contract_id text, since bigint) returns bigint language sql as $$
  select count(distinct user_id)
  from contract_bets
  where contract_id = this_contract_id
    and created_time >= millis_to_ts(since);
$$;

create
or replace function get_noob_questions () returns setof contracts language sql as $$
  with newbs as (
    select id
    from users
    where created_time > now() - interval '2 weeks'
  )
  select * from contracts
  where creator_id in (select * from newbs)
  and visibility = 'public'
  order by created_time desc
$$;
