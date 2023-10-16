create table if not exists
  love_waitlist (
  id bigint generated always as identity primary key,
  email text not null,
  created_time timestamptz not null default now()
);

alter table love_waitlist enable row level security;

create policy "anon insert"
on public.love_waitlist
for insert
with check (true);