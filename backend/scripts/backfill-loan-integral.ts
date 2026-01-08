import { runScript } from 'run-script'
import { log } from 'shared/utils'

// Backfill script to initialize loan_day_integral and last_loan_update_time
// for existing user_contract_metrics with loans.
//
// This gives existing loans a "grace period" - they start accruing interest from now,
// rather than from when the loan was originally given.

if (require.main === module) {
  runScript(async ({ pg }) => {
    const now = Date.now()

    log('Backfilling loan_day_integral and last_loan_update_time...')

    // Update all metrics with loans to start tracking from now
    const result = await pg.result(
      `UPDATE user_contract_metrics
       SET loan_day_integral = 0,
           last_loan_update_time = $1
       WHERE loan > 0
         AND (last_loan_update_time IS NULL OR loan_day_integral IS NULL)`,
      [now]
    )

    log(`Updated ${result.rowCount} metrics with loans to start tracking interest from now.`)

    // Also update the data jsonb to include the new fields
    const jsonResult = await pg.result(
      `UPDATE user_contract_metrics
       SET data = data || jsonb_build_object(
         'loanDayIntegral', 0,
         'lastLoanUpdateTime', $1
       )
       WHERE loan > 0
         AND (data->>'loanDayIntegral' IS NULL OR data->>'lastLoanUpdateTime' IS NULL)`,
      [now]
    )

    log(`Updated ${jsonResult.rowCount} metrics' data jsonb fields.`)

    log('Backfill complete!')
  })
}
