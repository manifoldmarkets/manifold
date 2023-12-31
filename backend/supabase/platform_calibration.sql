
create table if not exists
    platform_calibration (
                             id bigint generated always as identity primary key,
                             created_time timestamptz not null default now(),
                             data jsonb not null
);

alter table platform_calibration enable row level security;

drop policy if exists "public read" on platform_calibration;

create policy "public read" on platform_calibration for
    select
    using (true);
