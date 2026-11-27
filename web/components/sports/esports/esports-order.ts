import { max, min, sortBy } from 'lodash'

import { EsportsSeriesFacts, EsportsTournamentView } from 'common/esports/types'
import { HOUR_MS } from 'common/util/time'
import { allStageSeries } from './esports-stage'

/** The provider's tiers, best first. No tier, or one not listed, goes last. */
const TIERS = ['s', 'a', 'b', 'c', 'd']

/**
 * A series still "in progress" this long after its start was left that way by
 * the data feed. It doesn't put its tournament in play, and it isn't the
 * tournament's next series.
 */
export const STALE_LIVE_MS = 12 * HOUR_MS

export const isStaleLive = (series: EsportsSeriesFacts, now: number) =>
  series.status === 'in_progress' &&
  series.startTimeMs != null &&
  now - series.startTimeMs > STALE_LIVE_MS

const tierRank = (tier: string | null) => {
  const rank = TIERS.indexOf(tier?.toLowerCase() ?? '')
  return rank < 0 ? TIERS.length : rank
}

const starts = (series: EsportsSeriesFacts[]) =>
  series.flatMap((s) => s.startTimeMs ?? [])

/**
 * Tournaments in the order the page leads with them. Those still to finish
 * come first: by tier, then one in play before one yet to start, then the one
 * whose next series is soonest. Finished ones follow: by tier, then the
 * latest to finish.
 */
export function orderTournaments(
  views: EsportsTournamentView[],
  now = Date.now()
) {
  const ranked = views.map((view) => {
    const all = view.stages.flatMap((s) => allStageSeries(s.view))
    const fresh = all.filter((s) => !isStaleLive(s, now))
    const open = fresh.filter((s) => s.status !== 'final')
    const finished = view.status === 'finished'
    return {
      view,
      finished: finished ? 1 : 0,
      tier: tierRank(view.tournament.tier),
      // In play, then yet to start, then nothing left but a stale live series.
      phase: finished
        ? 0
        : open.length === 0
        ? 2
        : fresh.some((s) => s.status !== 'scheduled')
        ? 0
        : 1,
      time: finished ? -(max(starts(all)) ?? 0) : min(starts(open)) ?? Infinity,
    }
  })
  return sortBy(ranked, [
    'finished',
    'tier',
    'phase',
    'time',
    'view.tournament.id',
  ]).map((r) => r.view)
}
