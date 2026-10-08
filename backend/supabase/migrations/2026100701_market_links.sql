-- A market linked to the market it's about, its parent: a prop on a game, a
-- sub-market of an election race. One parent per market (the primary key),
-- and one level deep: the API refuses a parent that is itself a child.
create table if not exists market_links (
  child_contract_id text primary key references contracts(id) on delete cascade,
  parent_contract_id text not null references contracts(id) on delete cascade,
  relation text not null default 'related'
    check (relation in ('line', 'prop', 'related')),
  created_by text not null references users(id),
  created_time timestamptz not null default now(),
  check (child_contract_id <> parent_contract_id)
);

create index if not exists market_links_parent on market_links (parent_contract_id);

-- Reads and writes go through the API.
alter table market_links enable row level security;
