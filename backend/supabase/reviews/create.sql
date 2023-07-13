create table if not exists
  reviews (
    reviewer_id text not null,
    vendor_id text not null,
    market_id text not null,
    rating numeric not null,
    content jsonb,
    created_time timestamptz not null default now(),
    primary key (reviewer_id, market_id)
  );

create table if not exists
  user_avg_ratings (
    user_id text not null primary key,
    avg_rating numeric not null
  );
