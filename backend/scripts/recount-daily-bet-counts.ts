// One-time rewrite of daily_stats.bet_count without unfilled API limit orders.
//
// Background: bet_count counted every non-redemption contract_bets row,
// including API limit orders that rested and never filled. Bots that re-quote
// constantly put 10-20x more of those in a day than real bets: one market maker
// placed ~270k a day with 2-second expirations, so the stats page showed
// 215k-359k "bets" a day against ~15-25k real ones. update-stats now leaves
// them out (see isUnfilledApiOrder); this script rewrites past days to match.
//
// bet_amount is untouched: an unfilled order's amount is 0, so it never added
// anything to it.
//
// Each day is one aggregate over that day's bets. A bot-heavy day is ~350k rows
// and took ~150s cold on prod, so run it outside the morning batch window.
//
// Usage (from backend/scripts):
//   Dry run (default, no writes):  npx ts-node recount-daily-bet-counts.ts 2026-01-01 2026-09-22
//   Apply the changes:             npx ts-node recount-daily-bet-counts.ts 2026-01-01 2026-09-22 --commit
// <end> is exclusive, like update-stats.

import { runScript } from './run-script'
import { log } from 'shared/utils'
import * as dayjs from 'dayjs'

const COMMIT = process.argv.includes('--commit')
const [start, end] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const dateregex = /^\d{4}-\d{2}-\d{2}$/

runScript(async ({ pg }) => {
  if (!dateregex.test(start ?? '') || !dateregex.test(end ?? '')) {
    log.error(
      'Usage: ts-node recount-daily-bet-counts.ts <start> <end> [--commit]'
    )
    process.exit(1)
  }

  let totalBefore = 0
  let totalAfter = 0
  for (
    let day = dayjs(start);
    day.isBefore(dayjs(end));
    day = day.add(1, 'day')
  ) {
    const date = day.format('YYYY-MM-DD')
    const next = day.add(1, 'day').format('YYYY-MM-DD')
    // Same rows getDailyBets counts, before and after the new filter.
    const { stored, all_bets, trades } = await pg.one<{
      stored: number | null
      all_bets: number
      trades: number
    }>(
      `select
         (select bet_count from daily_stats where start_date = $1) as stored,
         count(*)::int as all_bets,
         count(*) filter (
           where not (coalesce(b.is_api, false) and b.amount = 0)
         )::int as trades
       from contract_bets b join contracts c on b.contract_id = c.id
       where b.created_time >= date_to_midnight_pt($1)
         and b.created_time < date_to_midnight_pt($2)
         and b.is_redemption = false`,
      [date, next]
    )

    if (stored === null) {
      log(
        `${date}: no bet_count stored, skipping (all=${all_bets} trades=${trades})`
      )
      continue
    }
    totalBefore += stored
    totalAfter += trades
    log(
      `${date}: stored ${stored} -> ${trades} (recount of old definition: ${all_bets})`
    )
    if (COMMIT && stored !== trades) {
      await pg.none(
        `update daily_stats set bet_count = $2 where start_date = $1`,
        [date, trades]
      )
    }
  }

  log(
    `${COMMIT ? 'Rewrote' : 'Would rewrite'} bet_count ${start}..${end}: ` +
      `${totalBefore} -> ${totalAfter} total`
  )
})
