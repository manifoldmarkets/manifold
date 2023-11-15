
create table if not exists
    q_and_a (
                id text not null primary key,
                user_id text not null,
                question text not null,
                description text not null,
                bounty numeric not null,
                deleted boolean not null default false,
                created_time timestamptz not null default now()
);

alter table q_and_a enable row level security;

drop policy if exists "public read" on q_and_a;

create policy "public read" on q_and_a for
    select
    using (true);

create table if not exists
    q_and_a_answers (
                        id text not null primary key,
                        q_and_a_id text not null,
                        user_id text not null,
                        text text not null,
                        award numeric not null default 0.0,
                        deleted boolean not null default false,
                        created_time timestamptz not null default now()
);

alter table q_and_a_answers enable row level security;

drop policy if exists "public read" on q_and_a_answers;

create policy "public read" on q_and_a_answers for
    select
    using (true);
