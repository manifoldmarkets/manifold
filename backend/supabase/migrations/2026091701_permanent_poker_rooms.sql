-- Permanent public rooms have no player host. Apply before the updated API.
alter table public.poker_tables
alter column creator_id
drop not null;

alter table public.poker_tables
add constraint poker_permanent_room_config check (
  creator_id is not null
  or (
    visibility = 'public'
    and ante in (1, 100)
    and started
    and not closing
    and not closed
  )
);

create unique index poker_one_permanent_room_per_ante on public.poker_tables (ante)
where
  creator_id is null;

-- Retire old player-created public tables through normal, escrow-safe settlement.
update public.poker_tables
set
  closing = true,
  next_tick = coalesce(
    next_tick,
    floor(
      extract(
        epoch
        from
          now()
      ) * 1000
    )::bigint
  ),
  version = version + 1
where
  visibility = 'public'
  and creator_id is not null
  and not closed;

insert into
  public.poker_tables (id, creator_id, name, visibility, ante, started)
values
  (
    '6c1fa0ee-fba7-4c43-8645-e6bce3185941',
    null,
    'M1 public room',
    'public',
    1,
    true
  ),
  (
    '9baad32d-906a-4cee-9c22-7879208f99ed',
    null,
    'M100 public room',
    'public',
    100,
    true
  );
