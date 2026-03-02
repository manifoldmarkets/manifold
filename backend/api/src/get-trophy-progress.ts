import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type UserTrophyProgress, type TrophyTier } from 'common/trophies'

export const getTrophyProgress: APIHandler<'get-trophy-progress'> = async (
  props
) => {
  const { userId } = props
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone<{
    trophy_id: string
    current_value: string
    highest_claimed_tier: string | null
    last_claimed_time: string | null
  }>(
    `select trophy_id, current_value, highest_claimed_tier, last_claimed_time
     from user_trophy_progress
     where user_id = $1`,
    [userId]
  )

  const trophies: UserTrophyProgress[] = rows.map((r) => ({
    trophyId: r.trophy_id,
    currentValue: Number(r.current_value),
    highestClaimedTier: (r.highest_claimed_tier as TrophyTier) ?? null,
    lastClaimedTime: r.last_claimed_time
      ? new Date(r.last_claimed_time).getTime()
      : null,
  }))

  return { trophies }
}
