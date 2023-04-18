-- ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
drop policy if exists "Enable read access all public/unlisted markets" on public.contracts;

create policy "Enable read access all public/unlisted markets" on public.contracts for
select
  using ((visibility <> 'private'::text));

drop policy if exists "Enable read access for admins" on public.contracts;

create policy "Enable read access for admins" on public.contracts for
select
  to service_role using (true);

drop policy if exists "Enable read access for private group markets if user is member" on public.contracts;

create policy "Enable read access for private group markets if user is member" on public.contracts for
select
  using (
    (
      visibility = 'private'::text
      and can_access_private_contract (id, firebase_uid ())
    )
  );
