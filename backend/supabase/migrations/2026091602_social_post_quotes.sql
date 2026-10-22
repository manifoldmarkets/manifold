alter table social_posts
  add column source_post_id text references social_posts(id);
