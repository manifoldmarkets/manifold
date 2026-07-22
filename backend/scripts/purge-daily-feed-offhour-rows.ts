import { ECI_FRONTIER_FEED_ID, TRUMP_APPROVAL_FEED_ID } from 'shared/oracle'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// One-off: daily-feed backfills iterated days with dayjs.tz(...).add(1,
// 'day'), which adds 24 UTC hours — every stamp after a PST→PDT switch
// landed at 1 AM LA instead of midnight, duplicating (with slightly
// different values) the correctly-stamped daily-job rows. The loops are
// fixed; this removes every off-midnight row. Run the backfills afterward
// so days that only existed as off-midnight rows are rewritten.
runScript(async ({ pg }) => {
  for (const feedId of [ECI_FRONTIER_FEED_ID, TRUMP_APPROVAL_FEED_ID]) {
    const deleted = await pg.result(
      `delete from oracle_prices
        where feed_id = $1
          and (ts at time zone 'America/Los_Angeles')::time <> time '00:00:00'`,
      [feedId],
      (r) => r.rowCount
    )
    log(`${feedId}: deleted ${deleted} off-midnight rows`)
  }
})
