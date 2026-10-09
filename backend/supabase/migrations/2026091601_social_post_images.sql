alter table social_posts
  add column image_urls text[] not null default '{}',
  add constraint social_posts_image_limit check (cardinality(image_urls) <= 4);
