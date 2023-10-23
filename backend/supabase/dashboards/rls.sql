alter table dashboards enable row level security;

create policy "Enable read access for admin" on public.dashboards for
select
  to service_role using (true);
