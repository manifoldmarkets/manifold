alter table group_members enable row level security;

drop policy if exists "public read" on group_members;

create policy "public read" on group_members for
select
  using (true);

drop policy if exists "user can leave";

create policy "user can leave" on group_members for delete using (group_members.member_id = firebase_uid ());
