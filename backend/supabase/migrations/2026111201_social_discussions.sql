-- Stable share identities, reversible per-user re-Yaps, and thread preferences.
alter table social_posts add column if not exists canonical_key text;
alter table social_posts add column if not exists feed_visible boolean not null default true;
alter table social_posts add column if not exists hidden_time timestamptz;
-- Replies made before this migration stay out of the feed. A post that has a
-- market comment is left alone, so running this again after the new API is
-- live does not hide Yaps that quote a comment and also comment on its market.
update social_posts set feed_visible=false where parent_id is not null and market_comment_id is null;
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
-- People follow the threads they posted in on Yap. A market or trade card and
-- the copy of a market comment carry a canonical key and were not posted on
-- Yap by the person they name, so running this again after the new API is
-- live does not make market commenters, market creators or traders follow.
insert into social_thread_subscriptions(root_id,user_id)
select distinct root_id,user_id from social_posts
where deleted_time is null and canonical_key is null
on conflict do nothing;

-- Older withdrawn Yaps can still be linked from a surviving market comment.
update contract_comments cc set data=cc.data - 'socialPostId' - 'isRepost'
from social_posts s where s.deleted_time is not null and s.market_comment_id=cc.comment_id
  and cc.data->>'socialPostId'=s.id;

-- Run with the old API writers drained. Move a linked Yap like only when
-- its market comment and author are unambiguous. For each affected voter
-- retain the latest vote (a tie with a dislike goes to the Yap like).
-- Move the winning row in place, keeping its reaction ID and timestamp.
with linked as (
  select distinct s.id as post_id, cc.comment_id, cc.user_id as owner_id, r.user_id
  from social_posts s
  join contract_comments cc on cc.comment_id=s.market_comment_id and cc.user_id=s.user_id
  join user_reactions r on r.content_type='social_post' and r.content_id=s.id
    and r.reaction_type='like' and r.content_owner_id=cc.user_id
  where (s.source_contract_id is null or s.source_contract_id=cc.contract_id)
    and not exists(select 1 from contract_comments other
      where other.comment_id=cc.comment_id and other.contract_id<>cc.contract_id)
), votes as (
  select l.comment_id, r.user_id, r.reaction_id, r.content_type,
    row_number() over (partition by l.comment_id,r.user_id order by r.created_time desc,
      (r.reaction_type='like') desc, (r.content_type='comment') desc, r.reaction_id) as rank
  from linked l join user_reactions r on r.user_id=l.user_id and
    ((r.content_type='social_post' and r.content_id=l.post_id and r.content_owner_id=l.owner_id and r.reaction_type='like')
     or (r.content_type='comment' and r.content_id=l.comment_id and r.reaction_type in ('like','dislike')))
), discarded as (
  delete from user_reactions r using votes v
  where v.rank>1 and r.user_id=v.user_id and r.reaction_id=v.reaction_id
)
update user_reactions r set content_type='comment', content_id=v.comment_id
from votes v where v.rank=1 and v.content_type='social_post'
  and r.user_id=v.user_id and r.reaction_id=v.reaction_id;

-- Recount the comments that have a post, and write only those whose counts are
-- wrong, so that running this again rewrites nothing that is already right.
with counted as (
  select cc.contract_id, cc.comment_id,
    (
      select count(distinct r.user_id) from user_reactions r
      where r.content_type='comment' and r.content_id=cc.comment_id and r.reaction_type='like'
    ) as likes,
    (
      select count(distinct r.user_id) from user_reactions r
      where r.content_type='comment' and r.content_id=cc.comment_id and r.reaction_type='dislike'
    ) as dislikes
  from contract_comments cc
  where exists(select 1 from social_posts s where s.market_comment_id=cc.comment_id)
)
update contract_comments cc set likes=counted.likes, dislikes=counted.dislikes
from counted
where cc.contract_id=counted.contract_id and cc.comment_id=counted.comment_id
  and (cc.likes is distinct from counted.likes or cc.dislikes is distinct from counted.dislikes);
