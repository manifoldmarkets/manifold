-- Add indexes to speed up unified feed repost and activity queries
-- Wrapped in DO block to skip gracefully if tables don't exist yet (local dev)
do $$
begin
  create index if not exists posts_created_time on public.posts using btree (created_time desc);
  create index if not exists posts_user_created_time on public.posts using btree (user_id, created_time desc);
  create index if not exists posts_contract_created_time on public.posts using btree (contract_id, created_time desc);
  create index if not exists contract_comments_public_created_time_idx on public.contract_comments using btree (created_time desc) where (visibility = 'public'::text);
exception when undefined_table then null;
end $$;
