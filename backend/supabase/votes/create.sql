create table if not exists
  votes (
    id text not null,
    contract_id text not null,
    user_id text not null,
    created_time timestamptz not null default now(),
    primary key (id, contract_id, user_id)
  );
