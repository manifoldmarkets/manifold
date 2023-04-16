drop policy if exists "Enable read access for non private posts" on public.posts;
CREATE POLICY "Enable read access for non private posts" ON public.posts FOR
SELECT USING (NOT (data @> '{"visibility": "private"}'::jsonb));
drop policy if exists "Enable read access for private posts with permissions" on public.posts;
CREATE POLICY "Enable read access for private posts with permissions" ON public.posts FOR
SELECT USING (
        (data @> '{"visibility": "private"}'::jsonb)
        AND is_group_member(data->>'groupId', firebase_uid())
    );