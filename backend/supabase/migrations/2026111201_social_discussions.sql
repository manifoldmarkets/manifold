-- Stable share identities, reversible per-user re-Yaps, and thread preferences.
alter table social_posts add column if not exists canonical_key text;
alter table social_posts add column if not exists feed_visible boolean not null default true;
alter table social_posts add column if not exists hidden_time timestamptz;
update social_posts set feed_visible=false where parent_id is not null;
create unique index if not exists social_posts_canonical_key on social_posts(canonical_key) where canonical_key is not null;
create unique index if not exists social_posts_comment_identity on social_posts(market_comment_id) where market_comment_id is not null;

create table if not exists social_reposts (
  post_id text not null references social_posts(id),
  user_id text not null references users(id),
  active boolean not null default true,
  created_time timestamptz not null default now(),
  bumped_time timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists social_reposts_active_time on social_reposts(bumped_time desc, post_id) where active;
alter table social_reposts enable row level security;

create table if not exists social_thread_subscriptions (
  root_id text not null references social_posts(id),
  user_id text not null references users(id),
  muted boolean not null default false,
  created_time timestamptz not null default now(),
  primary key (root_id, user_id)
);
alter table social_thread_subscriptions enable row level security;
insert into social_thread_subscriptions(root_id,user_id)
select distinct root_id,user_id from social_posts where deleted_time is null
on conflict do nothing;

-- Keep old likes on mirrored comments in the same reaction collection used by
-- the market UI. No duplicate per-user likes are introduced.
insert into user_reactions(content_id,content_type,content_owner_id,user_id,reaction_type,created_time)
select distinct on (s.market_comment_id,r.user_id)
  s.market_comment_id,'comment',r.content_owner_id,r.user_id,'like',r.created_time
from user_reactions r join social_posts s on s.id=r.content_id
where r.content_type='social_post' and r.reaction_type='like' and s.market_comment_id is not null
and not exists (select 1 from user_reactions existing where existing.content_type='comment'
  and existing.content_id=s.market_comment_id and existing.user_id=r.user_id and existing.reaction_type='like')
order by s.market_comment_id,r.user_id,r.created_time;
delete from user_reactions r using social_posts s
where r.content_type='social_post' and r.content_id=s.id and s.market_comment_id is not null;

update contract_comments cc set likes=(
  select count(distinct r.user_id) from user_reactions r
  where r.content_type='comment' and r.content_id=cc.comment_id and r.reaction_type='like'
) where exists(select 1 from social_posts s where s.market_comment_id=cc.comment_id);
