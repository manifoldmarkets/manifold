import { getStreakDayToJudge } from 'common/streak'
import { HOUR_MS } from 'common/util/time'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { streakQualifyingActivitySql } from 'shared/supabase/users'
import { log } from 'shared/utils'
import { createStreakFreezeUsedNotification } from 'shared/create-notification'

// If the scheduler falls this far behind, let the next night's run proceed
// instead: the judged day has receded far enough that punishing it hours
// later serves nobody. Within the window, lateness is safe — post-midnight
// activity is handled explicitly below and the update is idempotent.
const MAX_LATENESS_MS = 6 * HOUR_MS

export const resetBettingStreaksInternal = async () => {
  const pg = createSupabaseDirectClient()
  const { start, end } = getStreakDayToJudge()

  const lateBy = Date.now() - end
  if (lateBy > MAX_LATENESS_MS) {
    log.error(
      `Skipping streak reset: ran ${(lateBy / HOUR_MS).toFixed(
        1
      )}h after the ` +
        `streak day ending ${new Date(end).toISOString()} closed.`
    )
    return
  }

  log(
    `Resetting streaks for the day ${new Date(start).toISOString()} to ` +
      `${new Date(end).toISOString()}`
  )

  // One statement selects, mutates, and reports: every condition is
  // re-evaluated on the locked row at update time, so a bet or freeze
  // purchase landing mid-run is seen rather than raced, and the RETURNING
  // set is — by construction — exactly what the database changed.
  //
  // `lastBetTime` is stamped by incrementStreakQuery on precisely the
  // actions that advance a streak (see the invariant note in
  // shared/supabase/users.ts), so:
  //   lastBetTime in [start, end) -> the user kept the day; never selected.
  //   lastBetTime <  start        -> missed, per the scalar.
  //   lastBetTime >= end          -> acted after midnight; the overwritten
  //     scalar can't see into the closed day.
  // Every remaining candidate is then verified against the activity tables
  // themselves — required for the post-midnight cohort, and a safety net for
  // the scalar-missed one: a perp trade whose post-commit streak call failed
  // leaves a qualifying event row with no lastBetTime stamp, and the probe
  // spares that user rather than punishing a day they really traded.
  //
  // Verdicts mirror what a run at exactly `end` would have produced:
  //   freeze available -> spend it, streak untouched (a post-midnight
  //     increment stands: the freeze covers the missed day beneath it).
  //   no freeze -> streak becomes 0, or 1 when the user already acted today
  //     (an on-time run would have zeroed them before that action, which
  //     would then have started a fresh streak of 1).
  //   a streak of exactly 1 born from a post-midnight action never spanned
  //     the judged day, so there is nothing to judge: not selected.
  //
  // The lastStreakFreezeTime guard makes a same-day re-run (scheduler
  // dashboard "Run now") a no-op instead of a second freeze burn; both
  // no-freeze outcomes are already self-idempotent.
  const affected = await pg.manyOrNone<{
    id: string
    streak_after: number
    freezes_after: number
    froze: boolean
  }>(
    `update users u
    set data = data ||
      case when coalesce((data->'streakForgiveness')::int, 0) > 0 then
        jsonb_build_object(
          'streakForgiveness', coalesce((data->'streakForgiveness')::int, 0) - 1,
          'lastStreakFreezeTime', $3::bigint
        )
      else
        jsonb_build_object(
          'currentBettingStreak',
          case when coalesce((data->>'lastBetTime')::bigint, 0) >= $2
            then 1 else 0 end
        )
      end
    where (u.data->'currentBettingStreak')::int > 0
      and coalesce((u.data->>'lastStreakFreezeTime')::bigint, 0) < $2
      and ((u.data->'currentBettingStreak')::int
        - case when coalesce((u.data->>'lastBetTime')::bigint, 0) >= $2
            then 1 else 0 end) > 0
      and (
        coalesce((u.data->>'lastBetTime')::bigint, 0) < $1
        or coalesce((u.data->>'lastBetTime')::bigint, 0) >= $2
      )
      and not ${streakQualifyingActivitySql(start, end)}
    returning
      u.id,
      (u.data->'currentBettingStreak')::int as streak_after,
      coalesce((u.data->'streakForgiveness')::int, 0) as freezes_after,
      -- Only the freeze branch writes this run's timestamp, and the where
      -- clause required the old value to sit strictly below the day end,
      -- so equality marks the branch unambiguously. (No parameter tokens
      -- in comments: pg-promise substitutes inside them too.)
      coalesce((u.data->>'lastStreakFreezeTime')::bigint, 0) = $3 as froze`,
    [start, end, Date.now()]
  )

  if (affected.length === 0) {
    log('No streaks to reset')
    return
  }

  const frozen = affected.filter((u) => u.froze)
  const ended = affected.filter((u) => !u.froze && u.streak_after === 0)
  const restarted = affected.filter((u) => !u.froze && u.streak_after === 1)
  log(
    `Reset streaks complete: ${frozen.length} freezes used, ` +
      `${ended.length} streaks ended, ${restarted.length} restarted at 1 ` +
      `(missed the day, then bet before this ran)`
  )

  if (frozen.length > 0) {
    await createStreakFreezeUsedNotification(
      frozen.map((u) => ({
        id: u.id,
        streak: u.streak_after,
        freezesRemaining: u.freezes_after,
      })),
      pg
    )
  }
}
