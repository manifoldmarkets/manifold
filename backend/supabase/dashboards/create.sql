create table if not exists
  dashboards (
    id text not null primary key default random_alphanumeric (12),
    slug text not null unique,
    creator_id text not null,
    foreign key (creator_id) references users (id),
    created_time timestamptz not null default now(),
    description json,
    title text not null,
    items jsonb default '[]'::jsonb,
    visibility text default 'public',
    creator_username text not null,
    creator_name text not null,
    creator_avatar_url text not null
  );
