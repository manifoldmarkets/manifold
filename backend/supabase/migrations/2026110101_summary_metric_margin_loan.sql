begin;

-- The multiple-choice summary row (answer_id null) must carry the sum of its
-- answer rows' loans. 2026011302 added margin_loan, and the schema file was
-- updated to roll it up, but no migration replaced the live function, so prod
-- still sums only loan. Loan endpoints change margin_loan on answer rows
-- alone and rely on this trigger, so summary margin_loan has drifted since.
-- Run backend/scripts/backfill-summary-margin-loan.ts after this.
create or replace function public.update_null_answer_metrics () returns trigger language plpgsql as $function$
DECLARE
    sum_has_yes_shares BOOLEAN := FALSE;
    sum_has_no_shares BOOLEAN := FALSE;
    sum_has_shares BOOLEAN := FALSE;
    sum_loan NUMERIC := 0;
    sum_margin_loan NUMERIC := 0;
BEGIN
    -- Check if the new row has a non-null answer_id
    IF NEW.answer_id IS NOT NULL THEN
        -- Aggregate boolean fields and loans from rows with the same user_id and contract_id
        SELECT
            BOOL_OR(has_yes_shares),
            BOOL_OR(has_no_shares),
            BOOL_OR(has_shares),
            COALESCE(SUM(loan), 0),
            COALESCE(SUM(margin_loan), 0)
        INTO
            sum_has_yes_shares,
            sum_has_no_shares,
            sum_has_shares,
            sum_loan,
            sum_margin_loan
        FROM user_contract_metrics
        WHERE user_id = NEW.user_id
          AND contract_id = NEW.contract_id
          AND answer_id IS NOT NULL;
        -- Update the row where answer_id is null with the aggregated metrics
        UPDATE user_contract_metrics
        SET
            data = data || jsonb_build_object(
                    'hasYesShares', sum_has_yes_shares,
                    'hasNoShares', sum_has_no_shares,
                    'hasShares', sum_has_shares,
                    'loan', sum_loan,
                    'marginLoan', sum_margin_loan
                           ),
            has_yes_shares = sum_has_yes_shares,
            has_no_shares = sum_has_no_shares,
            has_shares = sum_has_shares,
            loan = sum_loan,
            margin_loan = sum_margin_loan
        WHERE user_id = NEW.user_id
          AND contract_id = NEW.contract_id
          AND answer_id IS NULL;
    END IF;

    RETURN NEW;
END;
$function$;

commit;
