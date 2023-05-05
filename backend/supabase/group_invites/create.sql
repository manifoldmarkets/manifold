drop table group_invites;

create table if not exists
  group_invites (
    id text not null primary key default random_alphanumeric (12),
    group_id text not null,
    foreign key (group_id) references groups (id),
    created_time timestamptz not null default now(),
    duration interval default '1 week',
    is_forever boolean not null default false,
    check (
      (
        duration is null
        and is_forever = true
      )
      or (duration is not null)
    ),
    uses numeric not null default 0,
    max_uses numeric default null
  );

create type group_invite_type as (
  id text,
  group_id text,
  created_time TIMESTAMPTZ,
  duration interval,
  is_forever boolean,
  uses numeric,
  max_uses numeric
);
