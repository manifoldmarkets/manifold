drop policy if exists "Enable read access for non private posts" on public.posts;

create policy "Enable read access for non private posts" on public.posts for
select
  using (visibility <> 'private');

drop policy if exists "Enable read access for private posts with permissions" on public.posts;

create policy "Enable read access for private posts with permissions" on public.posts for
select
  using (
    visibility = 'private'::text
    and is_group_member (group_id, firebase_uid ())
  );
