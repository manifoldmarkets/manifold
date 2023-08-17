alter table manalinks enable row level security;

create policy "Enable read access for admin" on public.manalinks for
select
  to service_role using (true);
