import { useEffect, useMemo, useRef, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import {
  LIVE_STATUSES,
  ScheduleGame,
  SportKey,
  SportsScheduleResponse,
} from 'common/sports-schedule'
import { HOUR_MS } from 'common/util/time'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsPageVisible } from 'web/hooks/use-page-visible'

/** A live value plus the time it arrived, so a later snapshot can supersede it. */
type Stamped<T> = { value: T; at: number }

/** Live overrides applied on top of the fetched schedule. */
type LiveGameState = {
  probs?: Record<string, Stamped<number>>
  liveScore?: Stamped<ScheduleGame['liveScore']>
}

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

  // A fresh snapshot supersedes every tick that arrived before it was
  // requested; ticks that came in while it was in flight may be newer, so
  // they stay. Without this an old tick would sit on top of newer refetches
  // until the next broadcast.
  const requestedAt = useRef(0)
  useEffect(() => {
    if (loading) requestedAt.current = Date.now()
  }, [loading])
  useEffect(() => {
    if (!data) return
    const cutoff = requestedAt.current
    setLive((prev) => pruneBefore(prev, cutoff))
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
      const at = Date.now()
      if (topic === `contract/${id}`) {
        // A binary game: YES is the home team, NO the away team.
        const prob = (data.contract as { prob?: number } | undefined)?.prob
        if (prob == null) return
        setLive((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            probs: {
              ...(prev[id]?.probs ?? {}),
              YES: { value: prob, at },
              NO: { value: 1 - prob, at },
            },
          },
        }))
      } else if (topic.endsWith('/updated-answers')) {
        const updates = (data.answers ?? []) as { id: string; prob?: number }[]
        setLive((prev) => {
          const probs = { ...(prev[id]?.probs ?? {}) }
          for (const a of updates) {
            if (a.prob != null) probs[a.id] = { value: a.prob, at }
          }
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
        setLive((prev) => ({
          ...prev,
          [id]: { ...prev[id], liveScore: { value: liveScore, at } },
        }))
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
      games: data.games.map((g) => applyLive(g, live[g.id])),
    }
  }, [data, live])

  return { schedule: merged, loading, refresh }
}

/** Drop every live value that arrived before `cutoff`; keeps the same object when nothing changes. */
function pruneBefore(
  state: Record<string, LiveGameState>,
  cutoff: number
): Record<string, LiveGameState> {
  const out: Record<string, LiveGameState> = {}
  let dropped = false
  for (const [id, s] of Object.entries(state)) {
    const probs: Record<string, Stamped<number>> = {}
    for (const [answerId, p] of Object.entries(s.probs ?? {})) {
      if (p.at >= cutoff) probs[answerId] = p
      else dropped = true
    }
    const keepScore = s.liveScore && s.liveScore.at >= cutoff
    if (s.liveScore && !keepScore) dropped = true
    const next: LiveGameState = {}
    if (Object.keys(probs).length > 0) next.probs = probs
    if (keepScore) next.liveScore = s.liveScore
    if (next.probs || next.liveScore) out[id] = next
  }
  return dropped ? out : state
}

function applyLive(game: ScheduleGame, state?: LiveGameState): ScheduleGame {
  if (!state) return game
  const p = state.probs ?? {}
  const withProb = <T extends { answerId: string; prob: number }>(t: T): T =>
    p[t.answerId] != null ? { ...t, prob: p[t.answerId].value } : t
  const liveScore =
    state.liveScore !== undefined ? state.liveScore.value : game.liveScore
  return {
    ...game,
    home: withProb(game.home),
    away: withProb(game.away),
    draw: game.draw ? withProb(game.draw) : null,
    liveScore,
    status: game.status === 'upcoming' && liveScore ? 'live' : game.status,
  }
}
