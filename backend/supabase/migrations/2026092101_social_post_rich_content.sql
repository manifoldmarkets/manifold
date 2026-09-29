alter table social_posts
  add column rich_content jsonb,
  add constraint social_posts_rich_content_object
    check (rich_content is null or jsonb_typeof(rich_content) = 'object');

-- Older API workers only update plain text. Drop obsolete formatting when those
-- workers edit or delete a post during deployment or after a rollback.
create function social_posts_clear_stale_rich_content() returns trigger
language plpgsql as $$
begin
  if new.deleted_time is not null then
    new.rich_content := null;
  elsif tg_op = 'UPDATE'
    and new.text is distinct from old.text
    and new.rich_content is not distinct from old.rich_content then
    new.rich_content := null;
  end if;
  return new;
end;
$$;

create trigger social_posts_clear_stale_rich_content
  before insert or update on social_posts
  for each row execute function social_posts_clear_stale_rich_content();
