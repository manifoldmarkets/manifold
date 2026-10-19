-- Yap -> market comment cross-posts, and Yap reposts in the legacy `posts`
-- table. Additive and nullable: apply before deploying the API and scheduler.

-- The market comment posted alongside a Yap. No foreign key: the API writes
-- this link with the Yap, before the comment row exists.
alter table social_posts
  add column if not exists market_comment_id text;

-- The Yap that wrote a repost row, so deleting the Yap withdraws the repost.
alter table posts
  add column if not exists social_post_id text;

create index if not exists posts_social_post_id on posts(social_post_id)
  where social_post_id is not null;

-- Importance scoring counts the last day's Yaps per attached market.
create index if not exists social_posts_created_time on social_posts(created_time);
create index if not exists social_post_markets_contract on social_post_markets(contract_id);
