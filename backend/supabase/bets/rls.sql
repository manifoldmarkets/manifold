drop policy if exists "Enable read access for non private bets" on public.contract_bets;

create policy "Enable read access for non private bets" on public.contract_bets for
select
  using ((visibility <> 'private'::text));

drop policy if exists "Enable read access for private bets with permissions" on public.contract_bets;

create policy "Enable read access for private bets with permissions" on public.contract_bets for
select
  using (
    (visibility = 'private'::text)
    and can_access_private_contract(contract_id, firebase_uid ())
  );


create policy "Enable read access for all" on public.contract_bets for
select
  using (true);
