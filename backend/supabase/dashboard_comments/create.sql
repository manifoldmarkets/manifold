create table if not exists
  dashboard_comments (
    id text not null default random_alphanumeric (12),
    dashboard_id text not null,
    dashboard_slug text not null,
    dashboard_title text not null,
    reply_to_comment_id text,
    content json not null,
    created_time timestamptz not null default now(),
    user_id text not null,
    user_name text not null,
    user_username text not null,
    user_avatar_url text,
    likes integer not null default 0,
    visibility text default 'public',
    hidden boolean not null default false,
    hiddenTime timestamptz,
    hider_id text,
    edited_time timestamptz,
     primary key (id, dashboard_id)
  );
