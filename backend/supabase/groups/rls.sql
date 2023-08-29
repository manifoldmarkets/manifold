drop policy if exists "Enable read access for admin" on public.groups;

create policy "Enable read access for admin" on public.groups for
select
  to service_role using (true);

drop policy if exists "Enable read access for all if group is public/curated" on public.groups;

create policy "Enable read access for all if group is public/curated" on public.groups for
select
  using ((privacy_status <> 'private'));
