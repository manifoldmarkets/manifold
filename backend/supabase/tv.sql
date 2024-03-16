create table if not exists
  tv_schedule (
    id serial primary key,
    schedule_created_time timestamptz default now(),
    creator_id text not null,
    contract_id text not null,
    stream_id text not null,
    source text not null,
    start_time timestamptz not null,
    end_time timestamptz not null,
    is_featured boolean default false,
  );

alter publication supabase_realtime add table tv_schedule;