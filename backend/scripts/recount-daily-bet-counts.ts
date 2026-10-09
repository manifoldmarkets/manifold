// One-time rewrite of daily_stats.bet_count without unfilled API limit orders.
//
// Background: bet_count counted every non-redemption contract_bets row,
// including API limit orders that rested and never filled. Bots that re-quote
// put a lot of those in: ~20-30% of a day's count through 2025-26, and 10-20x
// the real trades once one market maker started placing ~270k a day with
// 2-second expirations (the stats page showed 215k-359k "bets" a day against
// ~15-25k real ones). update-stats now leaves them out (getDailyBets); this
// script rewrites past days to match. The stats page says so under the bets
// chart.
//
// A day is only rewritten if its stored count equals a fresh count under the
// old definition, so the only change is removing those orders. (On every day
// sampled from 2023-2026 the two matched exactly.) A day already at the new
// count is skipped, so re-running is safe. Any other mismatch is reported and
// left alone.
//
// bet_amount is untouched: an unfilled order's amount is 0, so it never added
// anything to it.
//
// is_api has been recorded since 2023-05-19, so start there; before that no
// order can be told apart. A bot-heavy day is ~350k rows and took ~150s cold on
// prod, so run it outside the morning batch window.
//
// Usage (from backend/scripts):
//   Dry run (default, no writes):  npx ts-node recount-daily-bet-counts.ts 2023-05-19 2026-09-22
//   Apply the changes:             npx ts-node recount-daily-bet-counts.ts 2023-05-19 2026-09-22 --commit
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
  const mismatched: string[] = []
  for (
    let day = dayjs(start);
    day.isBefore(dayjs(end));
    day = day.add(1, 'day')
  ) {
    const date = day.format('YYYY-MM-DD')
    const next = day.add(1, 'day').format('YYYY-MM-DD')
    // The rows getDailyBets counts, under the old and the new definition.
    const { stored, old_count, new_count } = await pg.one<{
      stored: number | null
      old_count: number
      new_count: number
    }>(
      `select
         (select bet_count from daily_stats where start_date = $1) as stored,
         count(*)::int as old_count,
         count(*) filter (
           where not (coalesce(b.is_api, false) and b.amount = 0)
         )::int as new_count
       from contract_bets b join contracts c on b.contract_id = c.id
       where b.created_time >= date_to_midnight_pt($1)
         and b.created_time < date_to_midnight_pt($2)
         and b.is_redemption = false`,
      [date, next]
    )

    if (stored === null || stored === new_count) continue
    if (stored !== old_count) {
      mismatched.push(date)
      log(
        `${date}: stored ${stored} matches neither definition (old ${old_count}, new ${new_count}), leaving it`
      )
      continue
    }
    totalBefore += stored
    totalAfter += new_count
    log(`${date}: ${stored} -> ${new_count}`)
    if (COMMIT) {
      await pg.none(
        `update daily_stats set bet_count = $2 where start_date = $1`,
        [date, new_count]
      )
    }
  }

  log(
    `${COMMIT ? 'Rewrote' : 'Would rewrite'} bet_count ${start}..${end}: ` +
      `${totalBefore} -> ${totalAfter} over the changed days. ` +
      `${mismatched.length} days left alone: ${mismatched.join(', ') || 'none'}`
  )
})
