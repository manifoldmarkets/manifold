
create index if not exists group_slug on public.groups (slug);
create index if not exists group_name on public.groups (name);
create index if not exists group_creator_id on public.groups (creator_id);
create index if not exists total_members on public.groups (total_members desc);
create index if not exists privacy_status_idx on public.groups using btree (privacy_status);
