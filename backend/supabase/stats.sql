
create table if not exists
    stats (
              title text not null primary key,
              daily_values numeric[]
);

alter table stats enable row level security;

drop policy if exists "public read" on stats;

create policy "public read" on stats for
    select
    using (true);
