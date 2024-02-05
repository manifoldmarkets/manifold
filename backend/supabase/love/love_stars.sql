create table if not exists
  love_stars (
    creator_id text not null,
    target_id text not null,
    star_id text not null default random_alphanumeric (12),
    created_time timestamptz not null default now(),
    primary key (creator_id, star_id)
  );

alter table love_stars enable row level security;

drop policy if exists "public read" on love_stars;

create policy "public read" on love_stars for
select
  using (true);
