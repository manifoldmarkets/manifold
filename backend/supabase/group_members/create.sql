create table if not exists
  group_members (
    group_id text not null,
    member_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    role text,
    created_time timestamptz,
    primary key (group_id, member_id)
  );

alter table group_members
cluster on group_members_pkey;