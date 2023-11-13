create table if not exists
  contract_answers (
    contract_id text not null,
    answer_id text not null,
    data jsonb not null,
    fs_updated_time timestamp not null,
    primary key (contract_id, answer_id)
  );

alter table contract_answers enable row level security;

drop policy if exists "public read" on contract_answers;

create policy "public read" on contract_answers for
select
  using (true);

create index if not exists contract_answers_data_gin on contract_answers using GIN (data);

alter table contract_answers
cluster on contract_answers_pkey;
