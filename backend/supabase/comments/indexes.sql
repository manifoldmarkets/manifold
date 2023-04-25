create index idx_contract_comments_visibility on public.contract_comments using btree (visibility)
create index contract_comments_created_time on public.contract_comments using btree (created_time desc)
create index contracts_comments_user_id on public.contract_comments using btree (user_id, created_time)
