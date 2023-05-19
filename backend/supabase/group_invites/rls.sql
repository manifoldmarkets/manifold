alter table group_invites enable row level security;

create policy "Enable read access for admin" on public.group_invites for
select
  to service_role using (true);
