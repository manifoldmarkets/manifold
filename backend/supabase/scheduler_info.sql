create table if not exists
    scheduler_info (
   id bigint generated always as identity primary key,
   job_name text not null unique,
   created_time timestamptz not null default now(),
   last_start_time timestamptz,
   last_end_time timestamptz
);

alter table scheduler_info enable row level security;

drop policy if exists "public read" on scheduler_info;

create policy "public read" on scheduler_info using (true);

