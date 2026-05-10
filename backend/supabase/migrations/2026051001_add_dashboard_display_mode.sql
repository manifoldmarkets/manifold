alter table dashboards
add column if not exists display_mode text default 'feed';
