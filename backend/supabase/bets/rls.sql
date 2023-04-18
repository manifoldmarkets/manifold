drop policy if exists "Enable read access for non private bets" on public.contract_bets;
CREATE POLICY "Enable read access for non private bets" ON public.contract_bets FOR
SELECT USING ((visibility <> 'private'::text));
drop policy if exists "Enable read access for private bets with permissions" on public.contract_bets;
CREATE POLICY "Enable read access for private bets with permissions" ON public.contract_bets FOR
SELECT USING (
        (visibility = 'private'::text)
        AND can_access_private_contract(contract_id, firebase_uid())
    );