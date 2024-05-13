create type status_type as enum('new', 'under review', 'resolved', 'needs admin');

create table if not exists
  mod_reports (
    report_id SERIAL primary key,
    created_time timestamptz not null default now(),
    comment_id text not null,
    contract_id text not null,
    user_id text not null,
    status status_type not null default 'new'
  );

alter table mod_reports enable row level security;

drop policy if exists "public read" on mod_reports;

create policy "public read" on mod_reports for
select
  using (true);

create index mod_reports_contract_id_time_created_idx on mod_reports (contract_id, created_time desc);

create index mod_reports_status on mod_reports (status);

create index mod_reports_user_id on mod_reports (user_id);

alter table mod_reports
cluster on mod_reports_pkey;
