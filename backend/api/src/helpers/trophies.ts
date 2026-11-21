import { APIError, AuthedUser } from 'api/helpers/endpoint'
import { TrophyClaim } from 'common/trophies'
import { SupabaseDirectClient } from 'shared/supabase/init'

// The page sends the profile it is changing. A session that switched accounts
// after the page loaded must not change the other account's trophies.
export function assertOwnProfile(userId: string, auth: AuthedUser) {
  if (userId !== auth.uid) {
    throw new APIError(
      403,
      'You are signed in as a different account. Reload the page.'
    )
  }
}

type TrophyClaimRow = {
  trophy_id: string
  milestone_id: string
  claimed_time: Date
}

export const convertTrophyClaim = (row: TrophyClaimRow): TrophyClaim => ({
  trophyId: row.trophy_id,
  milestoneId: row.milestone_id,
  claimedTime: new Date(row.claimed_time).valueOf(),
})

export async function getTrophyClaims(
  pg: SupabaseDirectClient,
  userId: string
): Promise<TrophyClaim[]> {
  const rows = await pg.manyOrNone<TrophyClaimRow>(
    `select trophy_id, milestone_id, claimed_time
     from user_trophy_milestones
     where user_id = $1
     order by claimed_time, trophy_id, milestone_id`,
    [userId]
  )
  return rows.map(convertTrophyClaim)
}

export async function getShowcasePins(
  pg: SupabaseDirectClient,
  userId: string
): Promise<string[] | null> {
  const row = await pg.oneOrNone<{ pins: string[] }>(
    `select pins from user_showcase where user_id = $1`,
    [userId]
  )
  return row ? row.pins : null
}
