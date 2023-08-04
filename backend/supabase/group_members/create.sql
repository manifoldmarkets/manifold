create table if not exists
  group_members (
    group_id text not null,
    member_id text not null,
    role text not null default 'member',
    created_time timestamptz default now(),
    primary key (group_id, member_id)
  );

alter table group_members
cluster on group_members_pkey;
