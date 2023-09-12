create table if not exists
  dashboards (
    id text not null primary key default random_alphanumeric (12),
    slug text not null unique,
    creator_id text not null,
    foreign key (creator_id) references users (id),
    created_time timestamptz not null default now(),
    views numeric not null default 0,
    description json,
    title text not null
  );

ALTER TABLE dashboards
ADD COLUMN items jsonb DEFAULT '[]'::jsonb;
