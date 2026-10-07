import { useEffect, useMemo, useRef, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import {
  AnySportKey,
  LIVE_STATUSES,
  ScheduleGame,
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
import { api } from 'web/lib/api/api'

/** Upcoming games per request; more load as the feed scrolls. */
export const SCHEDULE_PAGE_SIZE = 20
/** Refetch cadence while something is live or about to start… */
const ACTIVE_REFRESH_MS = 2 * 60_000
/** …and while nothing is: still needed to pick up kickoffs, closes and new markets. */
const IDLE_REFRESH_MS = 5 * 60_000

/** What the sport rail shows: the same in every response, whatever the sport. */
export type SportsRailData = Pick<
  SportsScheduleResponse,
  'sports' | 'counts' | 'liveCount'
>

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
export function useSportsSchedule(sport: AnySportKey | 'all', enabled = true) {
  const { data, refresh, loading } = useAPIGetter(
    'sports-schedule',
    { sport, limit: SCHEDULE_PAGE_SIZE },
    undefined,
    // One cache slot per sport, so switching back is instant and a sport's
    // list never flashes another sport's games.
    `sports-schedule-${sport}`,
    enabled
  )
  // Plain state (not the persistent store): ticks arrive every few seconds
  // during live games and the overlay is cheap to rebuild from a refetch.
  const [live, setLive] = useState<Record<string, LiveGameState>>({})

  // Pages after the first, loaded as the feed scrolls. Tagged with their
  // sport: the sport page stays mounted when the URL moves to another sport.
  // Each page keeps its own snapshot time for the live overlay below.
  const [more, setMore] = useState<{
    sport: string
    games: ScheduleGame[]
    snapshotTimes: Record<string, number>
    cursor: string | null
  }>()
  const extra = more?.sport === sport ? more : undefined
  const nextCursor = extra ? extra.cursor : data?.nextCursor ?? null
  const loadingMore = useRef(false)
  const loadMore = useEvent(async () => {
    const cursor = nextCursor
    if (!cursor || loadingMore.current) return false
    loadingMore.current = true
    try {
      const page = await api('sports-schedule', {
        sport,
        limit: SCHEDULE_PAGE_SIZE,
        cursor,
      })
      setLive((prev) => pruneForPage(prev, page))
      setMore((prev) => {
        const kept = prev?.sport === sport ? prev : undefined
        return {
          sport,
          games: [...(kept?.games ?? []), ...page.games],
          snapshotTimes: {
            ...kept?.snapshotTimes,
            ...Object.fromEntries(
              page.games.map((g) => [g.id, page.snapshotTime ?? 0])
            ),
          },
          cursor: page.nextCursor,
        }
      })
      return !!page.nextCursor
    } catch (e) {
      console.error('Failed to load more sports games', e)
      return false
    } finally {
      loadingMore.current = false
    }
  })

  // HTTP/client caches preserve the server's snapshot time. Request-start
  // time in the browser says nothing about how fresh that response is.
  useEffect(() => {
    if (!data) return
    setLive((prev) => pruneForPage(prev, data))
  }, [data])

  // The rail's sports, counts and live count cover every sport, whichever one
  // was asked for. Keep the latest across sport switches: a sport that hasn't
  // loaded yet would otherwise empty the rail, drop every count and reshuffle
  // the chips until its response arrives.
  const [lastRail, setLastRail] = usePersistentInMemoryState<
    SportsRailData | undefined
  >(undefined, 'sports-schedule-rail')
  useEffect(() => {
    if (!data) return
    setLastRail({
      sports: data.sports,
      counts: data.counts,
      liveCount: data.liveCount,
    })
  }, [data])
  const rail: SportsRailData | undefined = data
    ? { sports: data.sports, counts: data.counts, liveCount: data.liveCount }
    : lastRail

  // The first page wins when a game is on both: it is the fresher read.
  const games = useMemo(() => {
    const first = data?.games ?? []
    if (!extra) return first
    const seen = new Set(first.map((g) => g.id))
    return [...first, ...extra.games.filter((g) => !seen.has(g.id))]
  }, [data, extra])
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
    const firstIds = new Set(data.games.map((g) => g.id))
    return {
      ...data,
      games: games.map((g) =>
        applySportsLive(
          g,
          live[g.id],
          firstIds.has(g.id)
            ? data.snapshotTime
            : extra?.snapshotTimes[g.id] ?? data.snapshotTime
        )
      ),
      nextCursor,
    }
  }, [data, games, live, nextCursor])

  return {
    schedule: merged,
    rail,
    loading,
    refresh,
    loadMore,
    hasMore: !!nextCursor,
  }
}

// Prunes the live overlay against one page's snapshot, leaving the games of
// other pages alone: their prices were read at a different time.
function pruneForPage(
  prev: Record<string, LiveGameState>,
  page: SportsScheduleResponse
) {
  const ids = new Set(page.games.map((g) => g.id))
  const onPage: Record<string, LiveGameState> = {}
  const rest: Record<string, LiveGameState> = {}
  for (const [id, state] of Object.entries(prev)) {
    if (ids.has(id)) onPage[id] = state
    else rest[id] = state
  }
  const pruned = pruneSportsLive(onPage, page)
  return pruned === onPage ? prev : { ...rest, ...pruned }
}
