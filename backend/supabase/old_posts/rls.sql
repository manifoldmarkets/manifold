drop policy if exists "Enable read access for non private posts" on public.old_posts;

create policy "Enable read access for non private posts" on public.old_posts for
select
  using (visibility <> 'private');
