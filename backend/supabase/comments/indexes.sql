create index contracts_comments_user_id on public.contract_comments using btree (user_id, created_time)
 