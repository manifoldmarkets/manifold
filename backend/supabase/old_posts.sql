-- This file is autogenerated from regen-schema.ts
create table if not exists
  old_posts (
    created_time timestamp with time zone default now(),
    creator_id text,
    data jsonb not null,
    group_id text,
    id text primary key default uuid_generate_v4 () not null,
    visibility text,
    importance_score numeric default 0 not null,
    boosted boolean default false not null
  );

-- Foreign Keys
alter table old_posts
add constraint public_old_posts_group_id_fkey foreign key (group_id) references groups (id) on update cascade on delete cascade;

-- Triggers
create trigger post_populate before insert
or
update on public.old_posts for each row
execute function post_populate_cols ();

-- Functions
create
or replace function public.post_populate_cols () returns trigger language plpgsql as $function$ begin 
    if new.data is not null then 
        new.visibility := (new.data)->>'visibility';
        new.group_id := (new.data)->>'groupId';
        new.creator_id := (new.data)->>'creatorId';
    end if;
    return new;
end $function$;

-- Row Level Security
alter table old_posts enable row level security;

-- Policies
drop policy if exists "public read" on old_posts;

create policy "public read" on old_posts for
select
  using (true);

-- Indexes
drop index if exists posts_pkey;

create unique index posts_pkey on public.old_posts using btree (id);

create index idx_old_posts_creator_id on old_posts (creator_id, created_time desc);

create index idx_old_posts_vis_created_time on old_posts (visibility, created_time desc);

create index idx_old_posts_vis_importance_score on old_posts (visibility, importance_score desc);

-- create index idx_old_posts_title_fts on old_posts using gin (to_tsvector('english', data ->> 'title'));
