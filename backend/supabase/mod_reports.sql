create type status_type as enum('new', 'under review', 'resolved', 'needs admin');

create table if not exists
  mod_reports (
    report_id SERIAL primary key,
    created_time timestamptz not null default now(),
    comment_id text not null,
    contract_id text not null,
    user_id text not null,
    status status_type not null default 'new',
    mod_note text
  );
