import { log } from 'shared/utils'
import { runScript } from './run-script'

// Give back streak freezes taken by the midnight race in
// reset-betting-streaks. Before fix/streak-freeze-day-window that job compared
// `lastBetTime` against a rolling `now() - interval '1 day'` anchored to its
// own (laggy) start time rather than to the Pacific calendar day, so a user
// whose only bet of a day landed in the first seconds after midnight was
// treated as having missed that day entirely.
//
// Known case: Eliza (hqdXgp0jK2YMMhPs067eFK4afEH3) placed her only bet of
// 2026-07-25 at 00:00:09 PT, was paid the streak bonus for it, and then lost a
// freeze to the run at 00:01:03 PT on 2026-07-26 — a cutoff 54s after the bet.
//
// Dry runs by default; pass --commit to actually write.
//   ts-node credit-streak-freezes.ts hqdXgp0jK2YMMhPs067eFK4afEH3
//   ts-node credit-streak-freezes.ts hqdXgp0jK2YMMhPs067eFK4afEH3 1 --commit
const args = process.argv.slice(2).filter((a) => a !== '--commit')
const COMMIT = process.argv.includes('--commit')
const TARGET = args[0]
const COUNT = args[1] === undefined ? 1 : Number(args[1])

if (require.main === module)
  runScript(async ({ pg }) => {
    if (!TARGET)
      throw new Error(
        'usage: credit-streak-freezes.ts <userId|username> [count] [--commit]'
      )
    if (!Number.isInteger(COUNT) || COUNT < 1)
      throw new Error(`count must be a positive integer, got "${args[1]}"`)

    // oneOrNone throws if a username somehow collides with another user's id,
    // which is the safe way to fail here.
    const user = await pg.oneOrNone<{
      id: string
      username: string
      streak: number
      freezes: number
    }>(
      `select
        id,
        username,
        coalesce((data->'currentBettingStreak')::int, 0) as streak,
        coalesce((data->'streakForgiveness')::int, 0) as freezes
      from users
      where id = $1 or username = $1`,
      [TARGET]
    )
    if (!user) throw new Error(`no user matching "${TARGET}"`)

    log(
      `${user.username} (${user.id}): streak ${user.streak}, ` +
        `freezes ${user.freezes} -> ${user.freezes + COUNT}`
    )

    if (!COMMIT) {
      log('Dry run — nothing written. Re-run with --commit to apply.')
      return
    }

    const updated = await pg.one<{ freezes: number }>(
      `update users
      set data = data || jsonb_build_object(
        'streakForgiveness', coalesce((data->'streakForgiveness')::int, 0) + $2
      )
      where id = $1
      returning (data->'streakForgiveness')::int as freezes`,
      [user.id, COUNT]
    )

    log(`Done — ${user.username} now has ${updated.freezes} streak freezes.`)
  })
