
create table if not exists
    market_ads (
                   id text not null primary key default uuid_generate_v4 (),
                   user_id text not null,
                   market_id text not null,
                   foreign key (market_id) references contracts (id),
                   funds numeric not null,
                   cost_per_view numeric not null,
                   created_at timestamp not null default now(),
                   embedding vector (1536) not null
);

alter table market_ads enable row level security;

drop policy if exists "public read" on market_ads;

create policy "public read" on market_ads for
    select
    using (true);

drop policy if exists "admin write access" on market_ads;

create policy "admin write access" on market_ads as PERMISSIVE for all to service_role;
