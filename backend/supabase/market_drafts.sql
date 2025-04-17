create table if not exists
  market_drafts (
    id bigint generated always as identity primary key,
    user_id text references users (id) not null,
    data jsonb not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
  );

create index market_drafts_user_id_idx on market_drafts (user_id);

alter table market_drafts enable row level security;

-- Function to update the timestamp
create
or replace function trigger_set_timestamp () returns trigger as $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language plpgsql;

-- Trigger to call the function
create trigger set_updated_at before
update on market_drafts for each row
execute function trigger_set_timestamp ();
