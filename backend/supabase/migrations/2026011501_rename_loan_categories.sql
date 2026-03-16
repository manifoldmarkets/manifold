-- Rename loan transaction categories
-- Wrapped in DO block to skip gracefully if table doesn't exist yet (local dev)
-- On production, this migration has already been applied.
do $$
begin
  -- Only rename LOAN -> MARGIN_LOAN for txns AFTER the first DAILY_FREE_LOAN
  update txns set category = 'MARGIN_LOAN'
  where category = 'LOAN'
    and created_time >= (select min(created_time) from txns where category = 'DAILY_FREE_LOAN');

  -- Rename DAILY_FREE_LOAN -> LOAN
  update txns set category = 'LOAN' where category = 'DAILY_FREE_LOAN';
exception when undefined_table then null;
end $$;
