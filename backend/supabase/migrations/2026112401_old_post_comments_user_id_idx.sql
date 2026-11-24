-- Trophy achievement reads count each user's legacy post comments.
create index concurrently if not exists old_post_comments_user_id on old_post_comments (user_id);
