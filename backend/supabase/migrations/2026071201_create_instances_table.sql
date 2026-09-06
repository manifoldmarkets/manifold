-- Registry of self-serve private Manifold instances. One row per instance,
-- always lives in `public` only — never cloned into a tenant schema (the
-- schema-cloning step in shared/supabase/clone-schema.ts excludes this table
-- explicitly, since it's the cross-tenant directory, not tenant data).
create table if not exists
  instances (
    id text primary key default uuid_generate_v4 () not null,
    subdomain text not null,
    schema_name text not null,
    name text not null,
    owner_id text not null references users (id),
    created_time timestamptz not null default now(),
    status text not null default 'active'
  );

drop index if exists instances_subdomain_idx;

create unique index instances_subdomain_idx on public.instances using btree (subdomain);

drop index if exists instances_schema_name_idx;

create unique index instances_schema_name_idx on public.instances using btree (schema_name);

drop index if exists instances_owner_id_idx;

create index instances_owner_id_idx on public.instances using btree (owner_id);

-- Row Level Security — subdomain/name are effectively public routing info
-- (like a group slug); everything else about an instance is managed only
-- through backend endpoints, which use createSupabaseDirectClient() and
-- bypass RLS.
alter table instances enable row level security;

drop policy if exists "public read" on instances;

create policy "public read" on instances for
select
  using (true);
