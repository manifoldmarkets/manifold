import { APIHandler } from 'api/helpers/endpoint'
import {
  getIsStarterTrophyAccount,
  getRewardedMilestones,
  getShowcasePins,
  getStarterStats,
  getTrophyClaims,
} from 'api/helpers/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getUserTrophies: APIHandler<'get-user-trophies'> = async ({
  userId,
}) => {
  const pg = createSupabaseDirectClient()
  const [claims, pins, isStarterAccount] = await Promise.all([
    getTrophyClaims(pg, userId),
    getShowcasePins(pg, userId),
    getIsStarterTrophyAccount(pg, userId),
  ])
  // Only new accounts get the starter trophies, so only they pay for the
  // live count.
  const [starter, rewarded] = isStarterAccount
    ? await Promise.all([
        getStarterStats(pg, userId),
        getRewardedMilestones(pg, userId),
      ])
    : [null, []]
  return { claims, pins, starter, rewarded }
}
