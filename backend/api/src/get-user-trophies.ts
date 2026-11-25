import { APIHandler } from 'api/helpers/endpoint'
import {
  getIsStarterTrophyAccount,
  getRewardedMilestones,
  getShowcasePins,
  getStarterStats,
  getTrophyClaims,
} from 'api/helpers/trophies'
import {
  RANKED_TROPHY_DEFINITIONS,
  type TrophyRank,
  type TrophyRankPeak,
} from 'common/trophies'
import type { League } from 'common/leagues'
import {
  createSupabaseDirectClient,
  READ_ONLY_REPEATABLE_MODE,
} from 'shared/supabase/init'
import { getEffectiveCurrentSeason } from 'shared/supabase/leagues'

export const getUserTrophies: APIHandler<'get-user-trophies'> = async ({
  userId,
}) => {
  const pg = createSupabaseDirectClient()
  // A snapshot that sees a pin saved after rollover must also see the new
  // season and the membership that made the pin eligible.
  return pg.tx({ mode: READ_ONLY_REPEATABLE_MODE }, async (tx) => {
    const season = await getEffectiveCurrentSeason(tx)
    const claims = await getTrophyClaims(tx, userId)
    const pins = await getShowcasePins(tx, userId)
    const league = await tx.oneOrNone<Pick<League, 'season' | 'division'>>(
      `select season, division from leagues where user_id = $1 and season = $2`,
      [userId, season]
    )
    // Only new accounts get the starter trophies, so only they pay for the
    // live count.
    const isStarterAccount = await getIsStarterTrophyAccount(tx, userId)
    const starter = isStarterAccount ? await getStarterStats(tx, userId) : null
    const rewarded = isStarterAccount
      ? await getRewardedMilestones(tx, userId)
      : []
    const rankedIds = RANKED_TROPHY_DEFINITIONS.map((def) => def.id)
    const ranks = await tx.manyOrNone<TrophyRank>(
      `select trophy_id as "trophyId", rank, value from trophy_ranks
       where user_id = $1 and trophy_id in ($2:csv)`,
      [userId, rankedIds]
    )
    const rankPeaks = await tx.manyOrNone<TrophyRankPeak>(
      `select trophy_id as "trophyId", best_rank as "bestRank" from user_trophy_rank_peaks
       where user_id = $1 and trophy_id in ($2:csv)`,
      [userId, rankedIds]
    )
    const state = await tx.oneOrNone<{ computed_time: string }>(
      'select computed_time from trophy_rank_state where id'
    )
    return {
      claims,
      pins,
      league,
      season,
      starter,
      rewarded,
      ranks,
      rankPeaks,
      ranksComputedTime: state ? new Date(state.computed_time).valueOf() : null,
    }
  })
}
