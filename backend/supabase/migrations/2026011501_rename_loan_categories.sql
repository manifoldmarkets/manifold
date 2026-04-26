-- Rename loan transaction categories
-- Historical context: Before DAILY_FREE_LOAN was introduced, all free loans used the LOAN category.
-- After DAILY_FREE_LOAN was introduced, LOAN started being used for margin loans.
-- So we only rename LOAN to MARGIN_LOAN for txns created AFTER the first DAILY_FREE_LOAN appeared.
-- DRY RUN MODE: This migration uses ROLLBACK by default.
-- To apply for real, change ROLLBACK to COMMIT at the bottom.
begin;

-- Only rename LOAN -> MARGIN_LOAN for txns AFTER the first DAILY_FREE_LOAN
-- (these are the actual margin loans; older LOAN txns were free loans)
update txns
set
  category = 'MARGIN_LOAN'
where
  category = 'LOAN'
  and created_time >= (
    select
      min(created_time)
    from
      txns
    where
      category = 'DAILY_FREE_LOAN'
  );

-- Rename DAILY_FREE_LOAN -> LOAN (these are free loans, keep them as LOAN)
update txns
set
  category = 'LOAN'
where
  category = 'DAILY_FREE_LOAN';

-- Verify results before committing
select
  category,
  count(*)
from
  txns
where
  category in ('LOAN', 'MARGIN_LOAN', 'DAILY_FREE_LOAN')
group by
  1;

-- Note: Old LOAN txns (before DAILY_FREE_LOAN existed) remain as LOAN
-- since they were actually free loans historically
-- Change ROLLBACK to COMMIT to apply for real
commit;
