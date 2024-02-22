create table if not exists
  tv_schedule (
    id serial primary key,
    schedule_created_time timestamptz default now(),
    contract_id text not null,
    stream_id text not null,
    source text not null,
    start_time timestamptz,
    end_time timestamptz,
  );

alter publication supabase_realtime add table tv_schedule;