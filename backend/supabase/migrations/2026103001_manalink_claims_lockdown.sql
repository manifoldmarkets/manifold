-- Manalink slugs are bearer secrets: anyone holding one can claim the link.
-- Close the two public read paths that expose them. Web reads both only
-- server-side with the service role (web/lib/supabase/manalinks.ts via
-- adminDb), which bypasses RLS and keeps execute below.

-- 1. manalink_claims.manalink_id is the slug, and the table was publicly
--    readable, so anyone could list every claimed slug.
drop policy if exists "public read" on manalink_claims;

-- 2. get_user_manalink_claims is security definer and was executable by anon.
--    Its filter `m.creator_id = creator_id` resolved the bare name to the
--    column, not the argument, so it returned every claim in the table.
--    Qualify the argument, take the claimant and time from the txn columns
--    (current MANALINK txns keep only a description in data, so data->>'toId'
--    and data->'createdTime' were null), and restrict execution to the
--    service role.
create or replace function public.get_user_manalink_claims (creator_id text)
returns table (manalink_id text, claimant_id text, ts bigint)
language sql security definer as $function$
    select mc.manalink_id, tx.to_id as claimant_id, ts_to_millis(tx.created_time) as ts
    from manalink_claims as mc
    join manalinks as m on mc.manalink_id = m.id
    join txns as tx on mc.txn_id = tx.id
    where m.creator_id = get_user_manalink_claims.creator_id
$function$;

revoke execute on function public.get_user_manalink_claims (text) from public, anon, authenticated;
grant execute on function public.get_user_manalink_claims (text) to service_role;
