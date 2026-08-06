import { getStreakDayToJudge } from 'common/streak'
import { HOUR_MS } from 'common/util/time'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { createStreakFreezeUsedNotification } from 'shared/create-notification'

// If the scheduler falls far behind, users will already have bet on the new
// day by the time this runs, and ending their streak would undo an increment
// they just earned. Bail out instead and let the next night's run proceed.
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

  // A streak survives if the user placed a real bet at any point during that
  // day. Ask the bets table directly rather than comparing against
  // `lastBetTime`: that single timestamp cannot distinguish "bet yesterday"
  // from "bet today, seconds after midnight, before this job ran", and the
  // latter used to be penalised.
  const missedTheDay = await pg.manyOrNone<{
    id: string
    streak: number
    freezes: number
  }>(
    `select
      u.id,
      (u.data->'currentBettingStreak')::int as streak,
      coalesce((u.data->'streakForgiveness')::int, 0) as freezes
    from users u
    where (u.data->'currentBettingStreak')::numeric > 0
      and not exists (
        select 1 from contract_bets b
        where b.user_id = u.id
          and b.created_time >= millis_to_ts($1)
          and b.created_time < millis_to_ts($2)
          and not b.is_redemption
          and not b.is_api
      )`,
    [start, end]
  )

  if (missedTheDay.length === 0) {
    log('No streaks to reset')
    return
  }

  // Drive the update off the ids just selected, so the set of users we notify
  // is exactly the set we modify. Evaluating the condition a second time here
  // would let a bet landing between the two statements desynchronise them.
  await pg.none(
    `update users
    set data = data ||
      case when coalesce((data->'streakForgiveness')::numeric, 0) > 0 then
        jsonb_build_object(
          'streakForgiveness', (data->'streakForgiveness')::numeric - 1,
          'lastStreakFreezeTime', $2::bigint
        )
      else
        jsonb_build_object('currentBettingStreak', 0)
      end
    where id = any($1)`,
    [missedTheDay.map((u) => u.id), Date.now()]
  )

  const usersWithFreezeUsed = missedTheDay.filter((u) => u.freezes > 0)
  log(
    `Reset streaks complete: ${usersWithFreezeUsed.length} freezes used, ` +
      `${missedTheDay.length - usersWithFreezeUsed.length} streaks ended`
  )

  if (usersWithFreezeUsed.length > 0) {
    await createStreakFreezeUsedNotification(
      usersWithFreezeUsed.map((u) => ({
        id: u.id,
        streak: u.streak,
        freezesRemaining: u.freezes - 1,
      })),
      pg
    )
  }
}
