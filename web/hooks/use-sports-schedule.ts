import { useEffect, useMemo, useRef, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import {
  LIVE_STATUSES,
  SportKey,
  SportsScheduleResponse,
} from 'common/sports-schedule'
import {
  applySportsLive,
  LiveGameState,
  pruneSportsLive,
} from 'common/sports-schedule-live'
import { HOUR_MS } from 'common/util/time'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsPageVisible } from 'web/hooks/use-page-visible'

/** Refetch cadence while something is live or about to start… */
const ACTIVE_REFRESH_MS = 2 * 60_000
/** …and while nothing is: still needed to pick up kickoffs, closes and new markets. */
const IDLE_REFRESH_MS = 5 * 60_000

/**
 * The sports schedule for a sport (or every sport), kept live:
 *  - answer probabilities move over the per-contract `updated-answers` topic
 *  - in-play scores arrive over `sports-live` (only for games near kickoff)
 *  - a periodic refetch catches state transitions (kickoff, resolution, new
 *    markets); faster while anything is live or about to start.
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

  // HTTP/client caches preserve the server's snapshot time. Request-start
  // time in the browser says nothing about how fresh that response is.
  useEffect(() => {
    if (!data) return
    setLive((prev) => pruneSportsLive(prev, data))
  }, [data])

  const games = data?.games ?? []
  const isPageVisible = useIsPageVisible()
  const now = Date.now()

  const topics = useMemo(() => {
    const out: string[] = []
    for (const g of games) {
      if (g.status === 'finished') continue
      // Binary games carry their price on the contract itself.
      out.push(
        g.binary ? `contract/${g.id}` : `contract/${g.id}/updated-answers`
      )
      // The poller only broadcasts around kickoff, so the topic is idle until
      // then; subscribing early means the first in-play tick flips the row to
      // live without waiting for a refetch. Community games have no feed.
      if (g.kickoffKnown) out.push(`contract/${g.id}/sports-live`)
    }
    return out
  }, [
    games.map((g) => `${g.id}:${g.status}:${g.binary ? 'b' : 'm'}`).join(','),
  ])

  useApiSubscription({
    topics,
    enabled: topics.length > 0 && isPageVisible,
    onBroadcast: ({ topic, data }) => {
      const id = topic.split('/')[1]
      if (!id) return
      const at = data.broadcastTime as number | undefined
      if (topic === `contract/${id}`) {
        // A binary game: YES is the home team, NO the away team.
        const prob = (data.contract as { prob?: number } | undefined)?.prob
        if (
          prob == null ||
          !Number.isFinite(prob) ||
          at == null ||
          !Number.isFinite(at)
        )
          return
        setLive((prev) =>
          (prev[id]?.probs?.YES?.at ?? 0) > at
            ? prev
            : {
                ...prev,
                [id]: {
                  ...prev[id],
                  probs: {
                    ...(prev[id]?.probs ?? {}),
                    YES: { value: prob, at },
                    NO: { value: 1 - prob, at },
                  },
                },
              }
        )
      } else if (topic.endsWith('/updated-answers')) {
        const updates = (data.answers ?? []) as { id: string; prob?: number }[]
        if (at == null || !Number.isFinite(at)) return
        setLive((prev) => {
          const probs = { ...(prev[id]?.probs ?? {}) }
          for (const a of updates) {
            if (
              a.prob != null &&
              Number.isFinite(a.prob) &&
              at >= (probs[a.id]?.at ?? 0)
            )
              probs[a.id] = { value: a.prob, at }
          }
          return { ...prev, [id]: { ...prev[id], probs } }
        })
      } else if (topic.endsWith('/sports-live')) {
        const status = data.sportsLiveStatus as string | undefined
        const scoreTime = data.sportsLiveUpdatedTime as number | undefined
        if (!status || scoreTime == null || !Number.isFinite(scoreTime)) return
        const liveScore =
          status && LIVE_STATUSES.has(status)
            ? {
                home: (data.sportsHomeScore as number | null) ?? null,
                away: (data.sportsAwayScore as number | null) ?? null,
                minute: (data.sportsLiveMinute as string | null) ?? null,
                status,
              }
            : null
        setLive((prev) =>
          (prev[id]?.liveScore?.at ?? 0) > scoreTime
            ? prev
            : {
                ...prev,
                [id]: {
                  ...prev[id],
                  liveScore: { value: liveScore, at: scoreTime, status },
                },
              }
        )
      }
    },
  })

  // Periodic refetch while the page is visible. `refresh` is re-created per
  // render and bound to the current sport, so the interval reads it through
  // a ref. Nothing else re-renders an idle page, so the timer is what moves
  // games from upcoming to live to finished and discovers new ones.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const hasActive = games.some(
    (g) =>
      g.status === 'live' ||
      (g.status === 'upcoming' && g.startTime - now < 4 * HOUR_MS)
  )
  useEffect(() => {
    if (!isPageVisible) return
    const ms = hasActive ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS
    const id = setInterval(() => refreshRef.current(), ms)
    return () => clearInterval(id)
  }, [hasActive, isPageVisible, sport])

  const merged: SportsScheduleResponse | undefined = useMemo(() => {
    if (!data) return undefined
    return {
      ...data,
      games: data.games.map((g) =>
        applySportsLive(g, live[g.id], data.snapshotTime)
      ),
    }
  }, [data, live])

  return { schedule: merged, loading, refresh }
}
