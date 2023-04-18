drop policy if exists "Enable read access for non private posts" on public.posts;

create policy "Enable read access for non private posts" on public.posts for
select
  using (not (data @> '{"visibility": "private"}'::jsonb));

drop policy if exists "Enable read access for private posts with permissions" on public.posts;

create policy "Enable read access for private posts with permissions" on public.posts for
select
  using (
    (data @> '{"visibility": "private"}'::jsonb)
    and is_group_member (data ->> 'groupId', firebase_uid ())
  );
