alter table users enable row level security;

drop policy if exists "public read" on users;

create policy "public read" on users for
select
  using (true);
