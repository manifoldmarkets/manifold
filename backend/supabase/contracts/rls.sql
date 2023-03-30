-- ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
drop policy if exists "Enable read access all public/unlisted markets" on public.contracts;
CREATE POLICY "Enable read access all public/unlisted markets" ON public.contracts FOR
SELECT USING ((visibility <> 'private'::text));
drop policy if exists "Enable read access for admins" ON public.contracts;
CREATE POLICY "Enable read access for admins" ON public.contracts FOR
SELECT TO service_role USING (true);
drop policy if exists "Enable read access for private group markets if user is member" ON public.contracts;
CREATE POLICY "Enable read access for private group markets if user is member" ON public.contracts FOR
SELECT USING (
        (
            visibility = 'private'::text
            and can_access_contract(id, firebase_uid())
        )
    );