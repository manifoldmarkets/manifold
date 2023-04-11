DROP policy IF EXISTS "Enable read access for admin" ON public.groups;
CREATE POLICY "Enable read access for admin" ON public.groups FOR
SELECT TO service_role USING (TRUE);
DROP policy IF EXISTS "Enable read access for all if group is public/curated" ON public.groups;
CREATE POLICY "Enable read access for all if group is public/curated" ON public.groups FOR
SELECT USING (
        (
            (data @> '{"privacyStatus": "public"}'::jsonb)
            OR (data @> '{"privacyStatus": "curated"}'::jsonb)
        )
    );
DROP policy IF EXISTS "Enable read access for members of private groups" ON public.groups;
CREATE POLICY "Enable read access for members of private groups" ON public.groups FOR
SELECT USING (
        (
            (data @> '{"privacyStatus": "private"}'::jsonb)
            AND (
                EXISTS (
                    SELECT 1
                    FROM public.group_members
                    WHERE (
                            (group_members.group_id = groups.id)
                            AND (group_members.member_id = public.firebase_uid())
                        )
                )
            )
        )
    );