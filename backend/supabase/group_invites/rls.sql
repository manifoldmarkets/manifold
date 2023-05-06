alter table group_invites enable row level security;

-- drop policy if exists "Enable read access for non private comments" on public.contract_comments;
create policy "Enable read access for admin" on public.group_invites for
select
  to service_role using (true);