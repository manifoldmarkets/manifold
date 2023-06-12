create index if not exists group_members_data_gin on group_members using GIN (data);

create index group_members_member_id_idx on group_members (member_id);

create index group_members_created_time_idx on group_members (created_time);

