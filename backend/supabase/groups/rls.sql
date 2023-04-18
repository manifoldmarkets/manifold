drop policy if exists "Enable read access for admin" on public.groups;

create policy "Enable read access for admin" on public.groups for
select
  to service_role using (true);

drop policy if exists "Enable read access for all if group is public/curated" on public.groups;

create policy "Enable read access for all if group is public/curated" on public.groups for
select
  using (
    (
      (data @> '{"privacyStatus": "public"}'::jsonb)
      or (data @> '{"privacyStatus": "curated"}'::jsonb)
    )
  );

drop policy if exists "Enable read access for members of private groups" on public.groups;

create policy "Enable read access for members of private groups" on public.groups for
select
  using (
    (
      (data @> '{"privacyStatus": "private"}'::jsonb)
      and (
        exists (
          select
            1
          from
            public.group_members
          where
            (
              (group_members.group_id = groups.id)
              and (group_members.member_id = public.firebase_uid ())
            )
        )
      )
    )
  );
