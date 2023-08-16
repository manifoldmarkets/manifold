drop policy if exists "Enable read access for non private bets" on public.contract_bets;

create policy "Enable read access for non private bets" on public.contract_bets for
select
  using ((visibility <> 'private'::text));
