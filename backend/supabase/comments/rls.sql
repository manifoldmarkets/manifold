-- drop policy if exists "Enable read access for non private comments" on public.contract_comments;
create policy "Enable read access for non private comments" on public.contract_comments for
select
  using ((visibility <> 'private'::text));

drop policy if exists "Enable read access for non private post comments" on public.post_comments;

create policy "Enable read access for non private post comments" on public.post_comments for
select
  using ((visibility <> 'private'::text));
