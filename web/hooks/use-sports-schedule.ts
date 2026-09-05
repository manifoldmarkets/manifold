import { useEffect, useMemo, useRef, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import {
  LIVE_STATUSES,
  ScheduleGame,
  SportKey,
  SportsScheduleResponse,
} from 'common/sports-schedule'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsPageVisible } from 'web/hooks/use-page-visible'

/** Live overrides applied on top of the fetched schedule. */
type LiveGameState = {
  probs?: Record<string, number>
  liveScore?: ScheduleGame['liveScore']
}

/**
 * The sports schedule for a sport (or every sport), kept live:
 *  - answer probabilities move over the per-contract `updated-answers` topic
 *  - in-play scores arrive over `sports-live` (only for games near kickoff)
 *  - a slow safety refetch catches state transitions (kickoff, resolution,
 *    new markets) while anything is live or about to start.
 *
 * Rows stay pure: this hook owns the single set of subscriptions for the
 * whole list, so a 100-game page costs ~100 topics, not 300+.
 */
export function useSportsSchedule(sport: SportKey | 'all', enabled = true) {
  const { data, refresh, loading } = useAPIGetter(
    'sports-schedule',
    { sport },
    undefined,
    // One cache slot per sport, so switching back is instant and a sport's
    // list never flashes another sport's games.
    `sports-schedule-${sport}`,
    enabled
  )
  // Plain state (not the persistent store): ticks arrive every few seconds
  // during live games and the overlay is cheap to rebuild from a refetch.
  const [live, setLive] = useState<Record<string, LiveGameState>>({})

  const games = data?.games ?? []
  const isPageVisible = useIsPageVisible()
  const now = Date.now()

  const topics = useMemo(() => {
    const out: string[] = []
    for (const g of games) {
      if (g.status === 'finished') continue
      out.push(`contract/${g.id}/updated-answers`)
      // Scores only flow once a game is close to (or past) kickoff.
      if (g.kickoffKnown && g.startTime - now < DAY_MS) {
        out.push(`contract/${g.id}/sports-live`)
      }
    }
    return out
  }, [games.map((g) => `${g.id}:${g.status}`).join(',')])

  useApiSubscription({
    topics,
    enabled: topics.length > 0 && isPageVisible,
    onBroadcast: ({ topic, data }) => {
      const id = topic.split('/')[1]
      if (!id) return
      if (topic.endsWith('/updated-answers')) {
        const updates = (data.answers ?? []) as { id: string; prob?: number }[]
        setLive((prev) => {
          const probs = { ...(prev[id]?.probs ?? {}) }
          for (const a of updates) if (a.prob != null) probs[a.id] = a.prob
          return { ...prev, [id]: { ...prev[id], probs } }
        })
      } else if (topic.endsWith('/sports-live')) {
        const status = data.sportsLiveStatus as string | undefined
        const liveScore =
          status && LIVE_STATUSES.has(status)
            ? {
                home: (data.sportsHomeScore as number | null) ?? null,
                away: (data.sportsAwayScore as number | null) ?? null,
                minute: (data.sportsLiveMinute as string | null) ?? null,
                status,
              }
            : null
        setLive((prev) => ({ ...prev, [id]: { ...prev[id], liveScore } }))
      }
    },
  })

  // Safety refetch while a game is live or within a few hours of kickoff.
  // `refresh` is re-created per render and bound to the current sport, so
  // the interval reads it through a ref.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const hasActive = games.some(
    (g) =>
      g.status === 'live' ||
      (g.status === 'upcoming' && g.startTime - now < 4 * HOUR_MS)
  )
  useEffect(() => {
    if (!hasActive || !isPageVisible) return
    const id = setInterval(() => refreshRef.current(), 120_000)
    return () => clearInterval(id)
  }, [hasActive, isPageVisible, sport])

  const merged: SportsScheduleResponse | undefined = useMemo(() => {
    if (!data) return undefined
    return {
      ...data,
      games: data.games.map((g) => applyLive(g, live[g.id])),
    }
  }, [data, live])

  return { schedule: merged, loading, refresh }
}

function applyLive(game: ScheduleGame, state?: LiveGameState): ScheduleGame {
  if (!state) return game
  const p = state.probs ?? {}
  const withProb = <T extends { answerId: string; prob: number }>(t: T): T =>
    p[t.answerId] != null ? { ...t, prob: p[t.answerId] } : t
  const liveScore =
    state.liveScore !== undefined ? state.liveScore : game.liveScore
  return {
    ...game,
    home: withProb(game.home),
    away: withProb(game.away),
    draw: game.draw ? withProb(game.draw) : null,
    liveScore,
    status: game.status === 'upcoming' && liveScore ? 'live' : game.status,
  }
}
