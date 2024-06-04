create table if not exists
  user_topic_interests (
    id bigint generated always as identity primary key,
    user_id text not null,
    created_time timestamptz not null default now(),
    group_ids_to_activity jsonb not null
  );

alter table user_topic_interests enable row level security;

create index if not exists user_topic_interests_created_time on user_topic_interests (user_id, created_time desc);

create or replace function get_user_topic_interests_2 (p_user_id text)
    returns table (group_id text,score numeric)
as $$
begin return query
    select
        kv.key as group_id,
        coalesce((kv.value->>'conversionScore')::numeric, 0.0) as score
    from (
             select group_ids_to_activity
             from user_topic_interests
             where user_id = p_user_id
             order by created_time desc
             limit 1
         ) as latest_record,
         jsonb_each(latest_record.group_ids_to_activity) as kv
    order by score desc;
end;
$$ language plpgsql;