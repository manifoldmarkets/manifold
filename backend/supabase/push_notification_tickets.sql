create table if not exists
    push_notification_tickets (
       id text primary key not null,
       status text not null,
       user_id text not null,
       notification_id text not null,
       created_time timestamptz not null default now(),
       receipt_status text not null,
       receipt_error text
    );

alter table push_notification_tickets enable row level security;

create index if not exists push_notification_tickets_status on push_notification_tickets (receipt_status);
