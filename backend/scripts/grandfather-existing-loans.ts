import { runScript } from './run-script'
import { log } from 'shared/utils'
import { upsertLoanTrackingQuery } from 'shared/helpers/user-contract-loans'
import type { LoanTrackingRow } from 'shared/helpers/user-contract-loans'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const now = Date.now()
    const batchSize = 5000 // Larger batch size for efficiency
    let lastId = 0
    let totalUpdated = 0
    let hasMoreRows = true

    log('Starting to grandfather existing loans with cursor-based batching...')
    log('Note: Processing without total count for better performance')

    while (hasMoreRows) {
      // Use cursor-based pagination (WHERE id > lastId) - much faster than OFFSET!
      // Excludes summary rows (answer_id IS NULL) since they shouldn't have tracking
      const outstandingLoans = await pg.manyOrNone<{
        id: number
        user_id: string
        contract_id: string
        answer_id: string | null
        loan: number
      }>(
        `SELECT id, user_id, contract_id, answer_id, loan
         FROM user_contract_metrics
         WHERE loan > 0 AND answer_id IS NOT NULL AND id > $1
         ORDER BY id
         LIMIT $2`,
        [lastId, batchSize]
      )

      if (outstandingLoans.length === 0) {
        break
      }

      hasMoreRows = outstandingLoans.length === batchSize

      // Update lastId to the last row's id for next iteration
      lastId = outstandingLoans[outstandingLoans.length - 1].id

      // Build tracking rows with loan_day_integral = 0 and last_loan_update_time = now
      const trackingRows: Omit<LoanTrackingRow, 'id'>[] = outstandingLoans.map(
        (loan) => ({
          user_id: loan.user_id,
          contract_id: loan.contract_id,
          answer_id: loan.answer_id,
          loan_day_integral: 0,
          last_loan_update_time: now,
        })
      )

      // Upsert tracking rows for this batch
      const upsertQuery = upsertLoanTrackingQuery(trackingRows)
      await pg.none(upsertQuery)

      totalUpdated += trackingRows.length
      log(
        `Processed batch: ${
          trackingRows.length
        } loans. Total updated so far: ${totalUpdated.toLocaleString()}`
      )
    }

    log(
      `✅ Successfully grandfathered ${totalUpdated.toLocaleString()} loans. Interest will no longer accrue on these loans.`
    )
  })
}
