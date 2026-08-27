begin;

-- Perp market suggestions from the /perps hub: a name (what you'd trade) and
-- an optional data source (what we'd measure it with), plus one upvote per
-- user to rank them. Nothing downstream is automated — the list is an input
-- to the team's launch queue. `hidden` is the moderation switch.
create table if not exists perp_suggestions (
  id bigserial primary key,
  user_id text not null,
  name text not null,
  data_source text,
  hidden boolean not null default false,
  created_time timestamptz not null default now()
);

-- Case-insensitive dedupe: a second "Gold price" becomes an upvote on the
-- first instead of a duplicate row.
create unique index if not exists perp_suggestions_name_key
  on perp_suggestions (lower(name));
create index if not exists perp_suggestions_user_created
  on perp_suggestions (user_id, created_time desc);

alter table perp_suggestions enable row level security;
drop policy if exists "public read perp suggestions" on perp_suggestions;
create policy "public read perp suggestions" on perp_suggestions
  for select using (true);

create table if not exists perp_suggestion_votes (
  suggestion_id bigint not null references perp_suggestions (id) on delete cascade,
  user_id text not null,
  created_time timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);

alter table perp_suggestion_votes enable row level security;
drop policy if exists "public read perp suggestion votes" on perp_suggestion_votes;
create policy "public read perp suggestion votes" on perp_suggestion_votes
  for select using (true);

commit;
