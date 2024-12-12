create table if not exists
  tasks (
    id bigint primary key generated always as identity not null,
    creator_id text not null references users (id),
    assignee_id text not null references users (id),
    category_id bigint not null,
    text text not null,
    completed boolean default false not null,
    priority integer default 0 not null,
    archived boolean default false not null,
    created_time timestamp with time zone default now() not null
  );

-- Row Level Security
alter table tasks enable row level security;

-- Policies
create policy "public read" on tasks for
select
  using (true);

-- Indexes
create index tasks_creator_id_idx on tasks (creator_id);

create index tasks_assignee_id_idx on tasks (assignee_id);

create index tasks_category_id_idx on tasks (category_id);
