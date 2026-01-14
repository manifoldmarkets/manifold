/**
 * Migration script to move interest-tracked loans to margin_loan field.
 * 
 * Logic:
 * - Loans with entries in user_contract_loans table have been accruing interest,
 *   so they should be moved to margin_loan field
 * - Loans without tracking remain as free loans in the loan field
 * 
 * After this migration:
 * - loan field = interest-free loans
 * - margin_loan field = interest-bearing loans tracked in user_contract_loans
 */

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

async function main() {
  const pg = createSupabaseDirectClient()
  
  log('Starting loan migration to margin_loan field...')
  
  // First, get all metrics that have corresponding loan tracking entries
  // These are the loans that have been accruing interest
  const metricsWithTracking = await pg.manyOrNone<{
    metric_id: number
    user_id: string
    contract_id: string
    answer_id: string | null
    current_loan: number
  }>(
    `SELECT 
      ucm.id as metric_id,
      ucm.user_id,
      ucm.contract_id,
      ucm.answer_id,
      ucm.loan as current_loan
    FROM user_contract_metrics ucm
    INNER JOIN user_contract_loans ucl 
      ON ucm.user_id = ucl.user_id 
      AND ucm.contract_id = ucl.contract_id 
      AND (ucm.answer_id = ucl.answer_id OR (ucm.answer_id IS NULL AND ucl.answer_id IS NULL))
    WHERE ucm.loan > 0`
  )
  
  log(`Found ${metricsWithTracking.length} metrics with interest tracking to migrate`)
  
  if (metricsWithTracking.length === 0) {
    log('No loans to migrate. Exiting.')
    return
  }
  
  // Process in batches
  const batchSize = 100
  let totalMigrated = 0
  
  for (let i = 0; i < metricsWithTracking.length; i += batchSize) {
    const batch = metricsWithTracking.slice(i, i + batchSize)
    
    // For each metric, move the loan from loan field to margin_loan field
    // This means: margin_loan = loan, loan = 0
    await pg.tx(async (tx) => {
      for (const metric of batch) {
        await tx.none(
          `UPDATE user_contract_metrics 
           SET 
             margin_loan = loan,
             loan = 0,
             data = data || jsonb_build_object('marginLoan', loan::numeric, 'loan', 0::numeric)
           WHERE id = $1`,
          [metric.metric_id]
        )
      }
    })
    
    totalMigrated += batch.length
    log(`Migrated ${totalMigrated}/${metricsWithTracking.length} metrics`)
  }
  
  log(`Migration complete. ${totalMigrated} loans moved to margin_loan field.`)
  
  // Verify the migration
  const verifyResult = await pg.one<{ total_loan: number; total_margin_loan: number }>(
    `SELECT 
      COALESCE(SUM(loan), 0) as total_loan,
      COALESCE(SUM(margin_loan), 0) as total_margin_loan
    FROM user_contract_metrics`
  )
  
  log(`After migration:`)
  log(`  Total in loan field (free loans): ${verifyResult.total_loan}`)
  log(`  Total in margin_loan field: ${verifyResult.total_margin_loan}`)
}

main()
  .then(() => {
    log('Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
