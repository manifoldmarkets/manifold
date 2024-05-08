create table if not exists
  user_topic_interests (
    id bigint generated always as identity primary key,
    user_id text not null,
    created_time timestamptz not null default now(),
    group_ids_to_activity jsonb not null
  );

alter table user_topic_interests enable row level security;

create index if not exists user_topic_interests_created_time on user_topic_interests (user_id, created_time desc);

create
or replace function get_user_topic_interests_1 (p_user_id text, limit_rows int) returns table (
  group_id text,
  avg_conversion_score numeric,
  groups_count bigint
) as $$ begin return query
    with interests_array as (
        select group_ids_to_activity, created_time
        from user_topic_interests
        where user_topic_interests.user_id = p_user_id
        order by created_time desc
        limit limit_rows
    ), unnested_objects as (
        select jsonb_array_elements(jsonb_agg(jsonb_build_object('group_ids_to_activity', group_ids_to_activity, 'created_time', created_time))) as obj
        from interests_array
    ), key_value_pairs as (
        select key, value, row_number() over (partition by key order by (obj->>'created_time')::timestamp desc) as position
        from unnested_objects
             cross join lateral jsonb_each(obj->'group_ids_to_activity') as kv(key, value)
    ), decay_factors as (
        select key, value, greatest(1.0 - 0.01 * (position - 1),0.01) as decay_factor
        from key_value_pairs
    )
    select
        key as group_id,
        sum(coalesce((value->>'conversionScore')::numeric, 0.0) * decay_factor) / count(decay_factor) as avg_conversion_score,
        count(*) as groups_count
    from decay_factors
    group by group_id
    order by avg_conversion_score desc, groups_count desc;
end; $$ language plpgsql;