-- Create idenfy_verifications table for storing identity verification results
create table if not exists
  idenfy_verifications (
    id bigint primary key generated always as identity not null,
    user_id text not null references users (id),
    scan_ref text unique,
    auth_token text,
    status text default 'pending' not null,
    created_time timestamp with time zone default now() not null,
    updated_time timestamp with time zone default now() not null,
    callback_data jsonb,
    overall_status text,
    fraud_status text,
    aml_status text
  );

-- Row Level Security
alter table idenfy_verifications enable row level security;

-- Indexes
create index if not exists idenfy_verifications_user_id_idx on public.idenfy_verifications using btree (user_id);

create unique index if not exists idenfy_verifications_scan_ref_idx on public.idenfy_verifications using btree (scan_ref)
where
  (scan_ref is not null);
