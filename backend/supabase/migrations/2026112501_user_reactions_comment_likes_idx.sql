-- Index for the live Liked Comments trophy stat (get-user-achievements) and its
-- nightly rank (update-trophy-ranks): comment likes by the comment's author.
-- On its own because a concurrent index build can't run inside a transaction.
-- Run before 2026112502_trophy_ladders_v2.sql.
create index concurrently if not exists user_reactions_comment_likes_by_owner on user_reactions (content_owner_id, content_id)
where
  content_type = 'comment'
  and reaction_type = 'like';
