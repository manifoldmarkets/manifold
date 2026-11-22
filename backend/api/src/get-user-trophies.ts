import { APIHandler } from 'api/helpers/endpoint'
import {
  getIsStarterTrophyAccount,
  getRewardedMilestones,
  getShowcasePins,
  getStarterStats,
  getTrophyClaims,
} from 'api/helpers/trophies'
import type { League } from 'common/leagues'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getEffectiveCurrentSeason } from 'shared/supabase/leagues'

export const getUserTrophies: APIHandler<'get-user-trophies'> = async ({
  userId,
}) => {
  const pg = createSupabaseDirectClient()
  const [claims, pins, isStarterAccount, season] = await Promise.all([
    getTrophyClaims(pg, userId),
    getShowcasePins(pg, userId),
    getIsStarterTrophyAccount(pg, userId),
    getEffectiveCurrentSeason(),
  ])
  // A league pin saved on another device was saved after the user joined.
  // Reading the league after the pins ensures we can see that membership.
  // Only new accounts get the starter trophies, so only they pay for the
  // live count.
  const [league, starter, rewarded] = await Promise.all([
    pg.oneOrNone<Pick<League, 'season' | 'division'>>(
      `select season, division from leagues where user_id = $1 and season = $2`,
      [userId, season]
    ),
    isStarterAccount ? getStarterStats(pg, userId) : null,
    isStarterAccount ? getRewardedMilestones(pg, userId) : [],
  ])
  return { claims, pins, league, starter, rewarded }
}
