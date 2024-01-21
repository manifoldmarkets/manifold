create table if not exists
  love_ships (
    creator_id text not null,
    target1_id text not null,
    target2_id text not null,
    ship_id text not null default random_alphanumeric(12),
    created_time timestamptz not null default now(),
    primary key (creator_id, ship_id)
  );

alter table love_ships enable row level security;

drop policy if exists "public read" on love_ships;

create policy "public read" on love_ships for
select
  using (true);

create index if not exists love_ships_target1_id on love_ships(target1_id);
create index if not exists love_ships_target2_id on love_ships(target2_id);
