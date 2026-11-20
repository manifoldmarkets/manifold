import { MSRY_MAX_SOURCE_AGE_MS } from 'common/perps/adjacent-msry'

import {
  createAdjacentMsryObserver,
  fetchAdjacentIndexPrices,
  getAdjacentApiKey,
} from 'shared/adjacent-msry'
import { localOracleClock } from 'shared/oracle-clock'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Read-only smoke test for the realtime MSRY feed. Run it once
// ADJACENT_API_KEY exists in the environment, before deploying
// scheduler-perps:
//
//   npx ts-node probe-adjacent-msry.ts
//
// It checks what the feed relies on and nothing else; no database writes:
//   1. the key is accepted and the organization's plan serves realtime data;
//   2. the one-minute series has a row for every minute, flat or not (the
//      feed treats a newest row older than MSRY_MAX_SOURCE_AGE_MS as an
//      outage, so a series that only records changes would pause the market
//      in every quiet stretch);
//   3. the observation the oracle tick would publish right now;
//   4. how far the delayed public value trails it.
if (require.main === module)
  runScript(async () => {
    if (!getAdjacentApiKey())
      throw new Error('ADJACENT_API_KEY is not set in this environment')

    const { rows } = await fetchAdjacentIndexPrices({
      tier: 'realtime',
      interval: '1min',
      perPage: 30,
    })
    if (rows.length === 0) throw new Error('Adjacent returned no MSRY rows')
    const now = Date.now()
    for (const row of rows)
      log(
        `${new Date(row.sourceTs).toISOString()}  ${row.price}  (${Math.round(
          (now - row.sourceTs) / 1000
        )}s ago)`
      )
    const gaps = rows
      .slice(1)
      .map((row, i) => rows[i].sourceTs - row.sourceTs)
      .filter((gap) => gap !== 60_000)
    if (gaps.length > 0)
      log.warn(
        `the one-minute series skips minutes (gaps of ${gaps
          .map((g) => `${g / 1000}s`)
          .join(', ')}); check this against MSRY_MAX_SOURCE_AGE_MS = ${
          MSRY_MAX_SOURCE_AGE_MS / 1000
        }s before launch`
      )
    else log(`one row per minute across ${rows.length} rows`)

    const observation = await createAdjacentMsryObserver()(localOracleClock)
    log(`the tick would publish: ${JSON.stringify(observation)}`)

    const delayed = await fetchAdjacentIndexPrices({
      tier: 'public',
      interval: '1hour',
      perPage: 1,
    })
    const publicLatest = delayed.rows[0]
    if (publicLatest)
      log(
        `public tier: ${publicLatest.price} as of ${new Date(
          publicLatest.sourceTs
        ).toISOString()} (realtime ${rows[0].price} as of ${new Date(
          rows[0].sourceTs
        ).toISOString()})`
      )
  })
