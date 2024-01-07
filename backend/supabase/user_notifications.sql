
create table if not exists
    user_notifications (
                           user_id text not null,
                           notification_id text not null,
                           data jsonb not null,
                           fs_updated_time timestamp not null,
                           primary key (user_id, notification_id)
);

alter table user_notifications enable row level security;

drop policy if exists "public read" on user_notifications;

create policy "public read" on user_notifications for
    select
    using (true);

create index if not exists user_notifications_notification_id on user_notifications (notification_id, user_id);

create index if not exists user_notifications_created_time on user_notifications (user_id, (to_jsonb(data) -> 'createdTime') desc);

create index if not exists user_notifications_unseen_text_created_time_idx on user_notifications (
                                                                                                  user_id,
    -- Unfortunately casting to a boolean doesn't work in postgrest  ((data->'isSeen')::boolean),
                                                                                                  (data ->> 'isSeen'),
                                                                                                  ((data -> 'createdTime')::bigint) desc
    );

alter table user_notifications
    cluster on user_notifications_created_time_idx;
