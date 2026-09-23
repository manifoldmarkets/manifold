create table social_post_markets (
  post_id text not null references social_posts(id) on delete cascade,
  contract_id text not null references contracts(id),
  position integer not null check (position >= 0 and position < 5),
  primary key(post_id, contract_id),
  unique(post_id, position)
);

alter table social_post_markets enable row level security;
