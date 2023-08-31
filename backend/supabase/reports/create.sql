-- matches report.ts
create table
  reports (
    id text not null default uuid_generate_v4 (),
    -- report writer ID
    user_id text not null references users (id),
    created_time timestamptz default now(),
    -- user that wrote the content that is being reported
    content_owner_id text not null references users (id),
    content_type text not null,
    content_id text not null,
    -- in case reporter wants to say why they reported it
    description text,
    parent_id text,
    parent_type text
  )
