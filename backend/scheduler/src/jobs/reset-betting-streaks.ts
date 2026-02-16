import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { createStreakFreezeUsedNotification } from 'shared/create-notification'

export const resetBettingStreaksInternal = async () => {
  const pg = createSupabaseDirectClient()
  log('Resetting streaks')

  // First, find users who will have their freeze used (so we can notify them)
  const usersWithFreezeUsed = await pg.manyOrNone<{
    id: string
    streak: number
    freezes_remaining: number
  }>(
    `select
      id,
      (data->'currentBettingStreak')::int as streak,
      (data->'streakForgiveness')::int - 1 as freezes_remaining
    from users
    where (data->'currentBettingStreak')::numeric > 0
      and (data->'lastBetTime')::numeric < ts_to_millis(now() - interval '1 day')
      and (data->'streakForgiveness')::numeric > 0`
  )

  // Now perform the update (both freeze decrements and streak resets)
  await pg.none(
    `update users
    set data = data ||
      case when (data->'streakForgiveness')::numeric > 0 then
        jsonb_build_object(
          'streakForgiveness', (data->'streakForgiveness')::numeric - 1,
          'lastStreakFreezeTime', ts_to_millis(now())
        )
      else
        jsonb_build_object('currentBettingStreak', 0)
      end
    where (data->'currentBettingStreak')::numeric > 0
    and (data->'lastBetTime')::numeric < ts_to_millis(now() - interval '1 day')`
  )

  log('Reset streaks complete')

  // Send notifications to users whose freeze was used
  if (usersWithFreezeUsed && usersWithFreezeUsed.length > 0) {
    log(`Sending streak freeze notifications to ${usersWithFreezeUsed.length} users`)
    await createStreakFreezeUsedNotification(
      usersWithFreezeUsed.map((u) => ({
        id: u.id,
        streak: u.streak,
        freezesRemaining: u.freezes_remaining,
      })),
      pg
    )
  }
}
