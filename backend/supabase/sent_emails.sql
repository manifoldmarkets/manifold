create table if not exists
  sent_emails (
    id bigint generated always as identity primary key,
    user_id text not null,
    email_template_id text not null,
    created_time timestamptz not null default now()
  );

alter table sent_emails enable row level security;

create index if not exists one_time_emails_user_id on sent_emails (user_id, email_template_id);