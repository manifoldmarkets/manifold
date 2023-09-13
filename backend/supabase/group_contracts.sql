
create table if not exists
    group_contracts (
                        group_id text not null,
                        contract_id text not null,
                        data jsonb,
                        fs_updated_time timestamp,
                        primary key (group_id, contract_id)
);

alter table group_contracts enable row level security;

drop policy if exists "public read" on group_contracts;

create policy "public read" on group_contracts for
    select
    using (true);

create index if not exists group_contracts_contract_id on group_contracts (contract_id);

alter table group_contracts
    cluster on group_contracts_pkey;

create type group_with_bet_flag as (
   id text,
   data jsonb,
   has_bet boolean
);

create or replace function get_groups_from_user_seen_markets(uid text)
    returns setof group_with_bet_flag
    language sql
as
$$
select (g.id, g.data, false)::group_with_bet_flag
from
    groups g
        join group_contracts gc on g.id = gc.group_id
        join user_seen_markets sm on gc.contract_id = sm.contract_id
where
        sm.user_id = uid
  and sm.type  = 'view market'
union
select (g.id, g.data, true)::group_with_bet_flag
from
    groups g
        join group_contracts gc on g.id = gc.group_id
        join contract_bets cb on gc.contract_id = cb.contract_id
where
        cb.user_id = uid
$$;

