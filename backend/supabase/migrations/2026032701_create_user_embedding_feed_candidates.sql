create table if not exists user_embedding_feed_candidates (
  user_id text not null,
  contract_id text not null,
  similarity_score numeric not null,
  computed_at timestamptz not null default now(),
  primary key (user_id, contract_id)
);

alter table user_embedding_feed_candidates enable row level security;

drop policy if exists "admin write access" on user_embedding_feed_candidates;
create policy "admin write access" on user_embedding_feed_candidates for all to service_role;

drop policy if exists "public read" on user_embedding_feed_candidates;
create policy "public read" on user_embedding_feed_candidates for select using (true);

create index if not exists idx_uef_user_similarity
  on user_embedding_feed_candidates (user_id, similarity_score desc);
