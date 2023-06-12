create table if not exists
  group_members (
    group_id text not null references groups (id) on delete cascade,
    member_id text not null references users (id) on delete cascade,
    data jsonb, -- deperecated. { "role": "admin", createdTime: ... }
    fs_updated_time timestamp,
    role text,
    created_time timestamptz default now(),
    primary key (group_id, member_id)
  );

alter table group_members
cluster on group_members_pkey;
