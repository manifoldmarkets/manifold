import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { log } from 'shared/utils'
import {
  backfillUserStatsWindow,
  isUserStatsTradesReady,
} from 'shared/user-stats-backfill'
import { runScript } from './run-script'

// Adds every trade made before the user_stats triggers were installed
// (migration 2026112220_user_stats.sql), one created_time window at a time,
// then marks user_stats.trades complete; get-user-achievements reads it from
// then on. Safe to stop and run again at any point, and to run twice at once
// (the second waits its turn per window). See dev-docs/user-stats.md.
//
//   yarn --cwd=backend/scripts ts-node backfill-user-stats.ts            # plan only
//   yarn --cwd=backend/scripts ts-node backfill-user-stats.ts --apply
//   yarn --cwd=backend/scripts ts-node backfill-user-stats.ts --verify <userId>

const MIN_WINDOW_S = 60
const MAX_WINDOW_S = 30 * 24 * 3600
// Aim for windows of about this long, so each transaction stays short.
const TARGET_MS = 1_500

if (require.main === module) {
  const argv = yargs(hideBin(process.argv))
    .option('apply', { type: 'boolean', default: false })
    .option('window-hours', { type: 'number', default: 6 })
    .option('pause-ms', {
      type: 'number',
      default: 200,
      description: 'Pause between windows, to leave the database room',
    })
    .option('max-minutes', { type: 'number', default: 0 })
    .option('verify', {
      type: 'string',
      description:
        'Compare one user’s counter with a direct count (only meaningful once complete, and while they are not trading)',
    })
    .parseSync()

  runScript(async ({ pg }) => {
    const progress = await pg.oneOrNone(
      `select bound::text, done_before::text, completed_time::text
       from user_stats_backfill where stat = 'trades'`
    )
    log('user_stats_backfill', progress)
    if (!progress) {
      log('Run migration 2026112220_user_stats.sql first.')
      return
    }

    if (argv.verify) {
      const userId = argv.verify
      const { counter } = await pg.one(
        `select coalesce((select trades from user_stats where user_id = $1), 0) as counter`,
        [userId]
      )
      const { direct } = await pg.one(
        `select count(*)::int as direct
         from contract_bets b
         join contracts c on c.id = b.contract_id and c.token = 'MANA'
         where b.user_id = $1
           and user_stats_bet_trades(
             b.amount, b.is_redemption, b.is_api,
             coalesce(b.data ->> 'isAutoRedemption' = 'true', false)
           ) = 1`,
        [userId]
      )
      log(
        `${userId}: user_stats ${counter}, direct count ${direct}${
          counter === direct ? ' (match)' : ' (MISMATCH)'
        }; ready: ${await isUserStatsTradesReady(pg)}`
      )
      return
    }

    if (!argv.apply) {
      log('Plan only. Pass --apply to add the windows.')
      return
    }

    const deadline = argv['max-minutes']
      ? Date.now() + argv['max-minutes'] * 60_000
      : Infinity
    let windowS = Math.round(argv['window-hours'] * 3600)
    let bets = 0
    let windows = 0
    while (Date.now() < deadline) {
      const start = Date.now()
      try {
        const step = await backfillUserStatsWindow(pg, `${windowS} seconds`)
        const ms = Date.now() - start
        if (step.completed && !step.from) {
          log('user_stats.trades is complete.')
          break
        }
        windows++
        bets += step.bets
        log(
          `window ${step.from} .. ${step.to}: ${step.bets} trades, ${step.users} users, ${ms} ms (window ${windowS} s; ${bets} trades in ${windows} windows)`
        )
        if (step.completed) {
          log('user_stats.trades is complete.')
          break
        }
        if (ms < TARGET_MS / 2) windowS = Math.min(windowS * 2, MAX_WINDOW_S)
        else if (ms > TARGET_MS * 2)
          windowS = Math.max(Math.round(windowS / 2), MIN_WINDOW_S)
      } catch (e) {
        const code = (e as { code?: string }).code
        // 55P03: gave way to a bet holding a stats row; 57014: the window
        // was too big for the statement timeout. Nothing was applied.
        if (code === '55P03') {
          log('A bet held a stats row; retrying the window.')
        } else if (code === '57014') {
          windowS = Math.max(Math.round(windowS / 4), MIN_WINDOW_S)
          log(`Window timed out; retrying with ${windowS} s.`)
        } else {
          throw e
        }
      }
      await new Promise((r) => setTimeout(r, argv['pause-ms']))
    }
  })
}
