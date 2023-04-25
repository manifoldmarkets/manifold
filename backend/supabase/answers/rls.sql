drop policy if exists "Enable read access on answers where user can access contracts" on public.contract_answers;

create policy "Enable read access on answers where user can access contracts" on public.contract_answers for
select
  using (
    exists (
      select
        1
      from
        contracts
      where
        contracts.id = contract_answers.contract_id
    )
  );
