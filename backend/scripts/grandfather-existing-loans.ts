import { runScript } from './run-script'
import { log } from 'shared/utils'
import { upsertLoanTrackingQuery } from 'shared/helpers/user-contract-loans'
import type { LoanTrackingRow } from 'shared/helpers/user-contract-loans'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const now = Date.now()
    const batchSize = 1000
    let offset = 0
    let totalUpdated = 0
    let hasMoreRows = true

    log('Starting to grandfather existing loans...')

    while (hasMoreRows) {
      // Query loans in batches
      const outstandingLoans = await pg.manyOrNone<{
        user_id: string
        contract_id: string
        answer_id: string | null
        loan: number
      }>(
        `SELECT user_id, contract_id, answer_id, loan
         FROM user_contract_metrics
         WHERE loan > 0
         ORDER BY user_id, contract_id, answer_id
         LIMIT $1 OFFSET $2`,
        [batchSize, offset]
      )

      hasMoreRows = outstandingLoans.length === batchSize
      offset += outstandingLoans.length

      if (outstandingLoans.length === 0) {
        if (totalUpdated === 0) {
          log('No outstanding loans found. Nothing to do.')
        }
        break
      }

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
        `Processed batch: ${trackingRows.length} loans. Total updated: ${totalUpdated}`
      )
    }

    log(
      `✅ Successfully grandfathered ${totalUpdated} loans. Interest will no longer accrue on these loans.`
    )
  })
}
