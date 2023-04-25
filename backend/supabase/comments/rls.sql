-- drop policy if exists "Enable read access for non private comments" on public.contract_comments;
create policy "Enable read access for non private comments" on public.contract_comments for
select
  using ((visibility <> 'private'::text));

-- drop policy if exists "Enable read access for private comments with permissions" on public.contract_comments;
create policy "Enable read access for private comments with permissions" on public.contract_comments for
select
  using (
    (visibility = 'private'::text)
    and can_access_private_contract (contract_id, firebase_uid ())
  );

-- drop policy if exists "Enable read access for non private post comments" on public.post_comments;
create policy "Enable read access for non private post comments" on public.post_comments for
select
  using ((visibility <> 'private'::text));

-- drop policy if exists "Enable read access for private post comments with permissions" on public.post_comments;
create policy "Enable read access for private post comments with permissions" on public.post_comments for
select
  using (
    (visibility = 'private'::text)
    and can_access_private_post (post_id, firebase_uid ())
  );
