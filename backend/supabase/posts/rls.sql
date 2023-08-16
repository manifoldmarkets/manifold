drop policy if exists "Enable read access for non private posts" on public.posts;

create policy "Enable read access for non private posts" on public.posts for
select
  using (visibility <> 'private');
