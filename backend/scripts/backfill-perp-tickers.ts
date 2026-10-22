// Stamp the canonical ticker (PERP_FEED_TICKERS in common/perps/ticker.ts) on
// every perp market whose stored ticker is missing or different. The badge
// and the /perps hub already show the mapped label for such rows, but search
// matches only the STORED value, so until this runs those markets cannot be
// found by ticker — and the launch preflight fails their ticker check.
// Settled markets are included: their pages still render the badge, and they
// should still be findable.
//
// Dry-run (default):
//   yarn ts-node backfill-perp-tickers.ts
//
// Apply:
//   yarn ts-node backfill-perp-tickers.ts --apply
//
// A market on a feed nobody has named is reported and left alone: add the
// feed to PERP_FEED_TICKERS rather than letting a script invent a label.

import { getPerpFeedTicker } from 'common/perps/ticker'
import { updateContract } from 'shared/supabase/contracts'
import { runScript } from './run-script'

type PerpRow = {
  id: string
  slug: string
  feed_id: string | null
  ticker: string | null
  resolved: boolean
}

const usage = 'Usage: yarn ts-node backfill-perp-tickers.ts [--apply]'

const run = async (apply: boolean) => {
  await runScript(async ({ pg }) => {
    console.log(apply ? 'Mode: APPLY' : 'Mode: DRY RUN (no writes)')

    const rows = await pg.manyOrNone<PerpRow>(
      `select id,
              slug,
              data->>'oracleFeedId' as feed_id,
              data->>'ticker' as ticker,
              resolution_time is not null as resolved
       from contracts
       where outcome_type = 'PERP'
       order by created_time`
    )

    const plans: { row: PerpRow; ticker: string }[] = []
    let ready = 0
    let unnamed = 0
    for (const row of rows) {
      const expected = getPerpFeedTicker(row.feed_id ?? undefined)
      const stored = row.ticker ? `"${row.ticker}"` : 'none'
      const status = row.resolved ? 'settled' : 'live'
      if (!expected) {
        unnamed++
        console.log(
          `[UNNAMED] ${row.slug} (${status}): feed ${
            row.feed_id ?? 'none'
          } is not in PERP_FEED_TICKERS; stored ${stored}, left alone`
        )
      } else if (row.ticker === expected) {
        ready++
        console.log(`[OK] ${row.slug} (${status}): ${expected}`)
      } else {
        plans.push({ row, ticker: expected })
        console.log(`[SET] ${row.slug} (${status}): ${stored} -> "${expected}"`)
      }
    }
    console.log(
      `Summary: ${rows.length} perp market(s), ${ready} already stamped, ` +
        `${plans.length} to update, ${unnamed} on unnamed feeds.`
    )

    if (plans.length === 0) return
    if (!apply) {
      console.log(
        'Dry run complete. Re-run with --apply to write the tickers listed above.'
      )
      return
    }

    for (const { row, ticker } of plans) {
      // Only the ticker. No lastUpdatedTime bump: a metadata stamp must not
      // read as market activity anywhere that sorts on it.
      await updateContract(pg, row.id, { ticker })
      console.log(`Updated ${row.slug}: ticker = "${ticker}"`)
    }

    // Verify by re-reading rather than trusting the loop.
    const stored = await pg.manyOrNone<{ id: string; ticker: string | null }>(
      `select id, data->>'ticker' as ticker
       from contracts
       where id = any($1::text[])`,
      [plans.map((plan) => plan.row.id)]
    )
    const unverified = plans.filter(
      ({ row, ticker }) =>
        stored.find((r) => r.id === row.id)?.ticker !== ticker
    )
    if (unverified.length > 0)
      throw new Error(
        `Backfill verification failed for: ${unverified
          .map(({ row }) => row.slug)
          .join(', ')}`
      )
    console.log(`Applied and verified ${plans.length} update(s).`)
  })
}

const args = process.argv.slice(2)
const unknown = args.filter((arg) => arg !== '--apply')
if (unknown.length > 0) {
  console.error(`Unknown argument(s): ${unknown.join(' ')}\n${usage}`)
  process.exit(1)
}

run(args.includes('--apply')).catch((error) => {
  console.error(error)
  process.exit(1)
})
