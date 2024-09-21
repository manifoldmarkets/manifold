import { createSupabaseDirectClient } from 'shared/supabase/init'

export const resetBettingStreaksInternal = async () => {
  const pg = createSupabaseDirectClient()

  await pg.none(
    `update users
    set data = data || 
      case when (data->'streakForgiveness')::numeric > 0 then
        jsonb_build_object('streakForgiveness', (data->'streakForgiveness')::numeric - 1)
      else
        jsonb_build_object('currentBettingStreak', 0)
      end
    where (data->'currentBettingStreak')::numeric > 0
    and (data->'lastBetTime')::numeric < ts_to_millis(now() - interval '1 day')`
  )
}
