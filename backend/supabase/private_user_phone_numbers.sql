
create table if not exists
    private_user_phone_numbers (
      id bigint generated always as identity primary key,
      created_time timestamptz not null default now(),
      last_updated_time timestamptz not null default now(),
      user_id text not null,
      phone_number text not null,
      constraint unique_phone_number_user_id unique (user_id),
      constraint unique_user_phone_number unique (phone_number)
);

alter table private_user_phone_numbers enable row level security;
