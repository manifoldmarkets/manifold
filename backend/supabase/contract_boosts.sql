create table if not exists
  contract_boosts (
    id bigint generated always as identity primary key,
    contract_id text references contracts (id),
    post_id text references old_posts (id),
    user_id text not null references users (id),
    start_time timestamptz not null,
    end_time timestamptz not null,
    created_time timestamptz not null default now(),
    funded boolean not null default true,
    constraint contract_boosts_content_check check (
      (
        contract_id is not null
        and post_id is null
      )
      or (
        contract_id is null
        and post_id is not null
      )
    )
  );

-- Indexes
create index if not exists contract_boosts_contract_id_idx on contract_boosts (contract_id, start_time, end_time);

create index if not exists contract_boosts_post_id_idx on contract_boosts (post_id, start_time, end_time);

create index if not exists contract_boosts_user_id_idx on contract_boosts (user_id);

-- Row Level Security
alter table contract_boosts enable row level security;
