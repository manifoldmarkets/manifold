-- Remove public read access from txns table.
-- All client reads go through API endpoints; only two RPC functions
-- (get_donations_by_charity, get_user_manalink_claims) need direct access,
-- so we mark them SECURITY DEFINER to bypass RLS.

drop policy if exists "public read" on txns;

create or replace function public.get_donations_by_charity ()
returns table (
  charity_id text,
  num_supporters bigint,
  total numeric
) language sql security definer as $function$
    select to_id as charity_id,
      count(distinct from_id) as num_supporters,
      sum(case
        when token = 'M$' then amount / 100
        when token = 'SPICE' then amount / 1000
        when token = 'CASH' then amount
        else 0
        end
      ) as total
    from txns
    where category = 'CHARITY'
    group by to_id
    order by total desc
$function$;

create or replace function public.get_user_manalink_claims (creator_id text)
returns table (manalink_id text, claimant_id text, ts bigint)
language sql security definer as $function$
    select mc.manalink_id, (tx.data)->>'toId' as claimant_id, ((tx.data)->'createdTime')::bigint as ts
    from manalink_claims as mc
    join manalinks as m on mc.manalink_id = m.id
    join txns as tx on mc.txn_id = tx.id
    where m.creator_id = creator_id
$function$;
