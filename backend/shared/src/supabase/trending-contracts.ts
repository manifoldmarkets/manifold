import { disinterestRankingWindow } from 'common/disinterests'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'
import {
  from,
  limit as lim,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import {
  getDisinterestTopicPenalties,
  hideUninterestedMarketsSql,
  rankWithDisinterestPenalty,
} from 'shared/supabase/user-disinterests'

type Db = SupabaseDirectClient | SupabaseTransaction

/** Open public markets by importance: what a feed shows before it knows the user. */
export const trendingContractsSql = (opts: {
  limit: number
  offset: number
  hideUninterestedFor?: string
}) =>
  renderSql(
    select(
      'id, data, importance_score, conversion_score, freshness_score, view_count, token'
    ),
    from('contracts'),
    where('close_time is null or close_time > now()'),
    where('resolution_time is null'),
    where(`visibility = 'public'`),
    where('deleted = false'),
    where(`outcome_type != 'STONK'`),
    where(`outcome_type != 'BOUNTIED_QUESTION'`),
    opts.hideUninterestedFor &&
      hideUninterestedMarketsSql(opts.hideUninterestedFor),
    orderBy('importance_score desc'),
    lim(opts.limit, opts.offset)
  )

/**
 * Trending order for a signed-in user who has no topic scores yet. Their
 * marks still count: hidden markets stay out, and recent marks weigh their
 * topics down across a bounded window of the top candidates. With no marks
 * this is exactly trendingContractsSql, so the cold-start page is unchanged
 * for everyone who never clicked Uninterested.
 */
export const trendingContractsForUserSql = async (
  pg: Db,
  userId: string,
  limit: number,
  offset: number
) => {
  const penalties = await getDisinterestTopicPenalties(pg, userId)
  if (!penalties) {
    return trendingContractsSql({ limit, offset, hideUninterestedFor: userId })
  }
  return rankWithDisinterestPenalty({
    candidatesSql: trendingContractsSql({
      limit: disinterestRankingWindow(limit, offset),
      offset: 0,
      hideUninterestedFor: userId,
    }),
    scoreColumn: 'importance_score',
    penalties,
    limit,
    offset,
  })
}
