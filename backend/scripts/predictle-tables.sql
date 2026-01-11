-- One-time script to initialize Predictle tables
create table if not exists
  predictle_daily (
    date_pt text primary key,
    data JSONB not null,
    created_time TIMESTAMPTZ default now()
  );

create table if not exists
  predictle_results (
    id SERIAL primary key,
    user_id text not null,
    puzzle_number int not null,
    attempts int not null,
    won boolean not null,
    created_time TIMESTAMPTZ default now(),
    unique (user_id, puzzle_number)
  );

create index if not exists idx_predictle_results_user_id on predictle_results (user_id);

create index if not exists idx_predictle_results_puzzle_number on predictle_results (puzzle_number);
