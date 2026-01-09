-- Table for tracking loan interest accrual
-- Separate from user_contract_metrics to avoid overhead on bet placement
create table if not exists
  user_contract_loans (
    id bigint primary key generated always as identity not null,
    user_id text not null,
    contract_id text not null,
    answer_id text,
    loan_day_integral numeric default 0 not null,
    last_loan_update_time bigint not null
  );

-- Row Level Security
alter table user_contract_loans enable row level security;

-- No public read policy - this table is only accessed by the backend

-- Indexes
drop index if exists user_contract_loans_contract;

create index user_contract_loans_contract on public.user_contract_loans using btree (contract_id);

drop index if exists user_contract_loans_user;

create index user_contract_loans_user on public.user_contract_loans using btree (user_id);

drop index if exists unique_user_contract_answer_loan;

create unique index unique_user_contract_answer_loan on public.user_contract_loans using btree (
  user_id,
  contract_id,
  coalesce(answer_id, ''::text)
);
