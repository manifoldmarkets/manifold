-- Add indexes to speed up unified feed repost and activity queries
begin;

-- Posts: support recent repost filtering and ordering
create index if not exists posts_created_time on public.posts using btree (created_time desc);
create index if not exists posts_user_created_time on public.posts using btree (user_id, created_time desc);
create index if not exists posts_contract_created_time on public.posts using btree (contract_id, created_time desc);

-- Contract comments: optimize public activity comment ordering
create index if not exists contract_comments_public_created_time_idx on public.contract_comments using btree (created_time desc)
where
  (visibility = 'public'::text);

commit;
