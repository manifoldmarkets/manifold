alter table group_members enable row level security;

drop policy if exists "public read" on group_members;

create policy "public read" on group_members for
select
  using (true);
