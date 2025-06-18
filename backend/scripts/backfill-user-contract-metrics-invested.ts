import { chunk } from 'lodash'
import { ContractMetric } from 'common/contract-metric'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import { runScript } from './run-script'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const contractIds = await pg.map(
      'select id from contracts',
      [],
      (r) => r.id
    )
    console.log(`Found ${contractIds.length} contracts to check.`)
    let contractsChecked = 0

    const contractIdChunks = chunk(contractIds, 100)
    let totalUpdated = 0

    for (const contractIdChunk of contractIdChunks) {
      console.log(`Processing batch of ${contractIdChunk.length} contracts...`)
      const metricsToUpdate: { [key: string]: ContractMetric } = {}

      const investedMismatches = await pg.manyOrNone(
        `select
            sum(cb.amount) as total_from_bets,
            ucm.user_id,
            ucm.contract_id,
            ucm.answer_id,
            ucm.data
        from
            user_contract_metrics ucm
                join
            contract_bets cb on ucm.contract_id = cb.contract_id
                and ucm.user_id = cb.user_id
                and ucm.answer_id is not distinct from cb.answer_id
        where
            cb.amount > 0 and ucm.contract_id = any($1)
        group by
            ucm.user_id, ucm.contract_id, ucm.answer_id, ucm.data
        having
            abs(((ucm.data->>'totalAmountInvested')::numeric) - sum(cb.amount)) > 1`,
        [contractIdChunk]
      )

      for (const row of investedMismatches) {
        const key = `${row.user_id}-${row.contract_id}-${
          row.answer_id ?? 'null'
        }`
        const metric = row.data as ContractMetric
        metric.totalAmountInvested = +row.total_from_bets
        metricsToUpdate[key] = metric
      }

      const soldMismatches = await pg.manyOrNone(
        `select
            sum(cb.amount) as total_from_bets,
            ucm.user_id,
            ucm.contract_id,
            ucm.answer_id,
            ucm.data
        from
            user_contract_metrics ucm
                join
            contract_bets cb on ucm.contract_id = cb.contract_id
                and ucm.user_id = cb.user_id
                and ucm.answer_id is not distinct from cb.answer_id
        where
            cb.amount < 0 and ucm.contract_id = any($1)
        group by
            ucm.user_id, ucm.contract_id, ucm.answer_id, ucm.data
        having
            abs(((ucm.data->>'totalAmountSold')::numeric) + sum(cb.amount)) > 1`,
        [contractIdChunk]
      )

      for (const row of soldMismatches) {
        const key = `${row.user_id}-${row.contract_id}-${
          row.answer_id ?? 'null'
        }`
        const metric = (metricsToUpdate[key] ?? row.data) as ContractMetric
        metric.totalAmountSold = -+row.total_from_bets
        metricsToUpdate[key] = metric
      }

      const updates = Object.values(metricsToUpdate)
      if (updates.length > 0) {
        console.log(`Found ${updates.length} metrics to update in this batch.`)
        totalUpdated += updates.length
        await bulkUpdateContractMetrics(updates, pg)
      } else {
        console.log('No metrics to update in this batch.')
      }
      contractsChecked += contractIdChunk.length
      console.log(`Checked ${contractsChecked} contracts so far.`)
      console.log(`Updated ${totalUpdated} metrics so far.`)
    }
    console.log(`✅ Done. Updated ${totalUpdated} metrics in total.`)
  })
}
