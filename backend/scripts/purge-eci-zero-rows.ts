import { ECI_FRONTIER_FEED_ID } from 'shared/oracle'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// One-off: remove bogus 0.00 frontier points written by the backfill before
// parseEciCsv filtered out blank-score models (Number('') === 0).
runScript(async ({ pg }) => {
  const deleted = await pg.result(
    `delete from oracle_prices where feed_id = $1 and price = 0`,
    [ECI_FRONTIER_FEED_ID],
    (r) => r.rowCount
  )
  log(`deleted ${deleted} zero-price ${ECI_FRONTIER_FEED_ID} rows`)
})
