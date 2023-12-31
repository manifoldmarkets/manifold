
create table if not exists
    contract_comment_edits (
                               id serial primary key,
                               contract_id text not null,
                               comment_id text not null,
                               editor_id text not null,
                               data jsonb not null,
                               created_time timestamptz not null default now()
);

alter table contract_comment_edits enable row level security;

drop policy if exists "public read" on contract_comment_edits;

create policy "public read" on contract_comment_edits for
    select
    using (true);

create index if not exists comment_edits_comment_id_idx on contract_comment_edits (comment_id);
