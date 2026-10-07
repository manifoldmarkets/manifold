import { useEffect, useMemo, useRef, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import {
  AnySportKey,
  LIVE_STATUSES,
  SportsScheduleResponse,
} from 'common/sports-schedule'
import {
  adoptedGames,
  appendPage,
  feedFromResponse,
  pruneLiveForPage,
  refreshLimit,
  ScheduleFeed,
} from 'common/sports-schedule-feed'
import { applySportsLive, LiveGameState } from 'common/sports-schedule-live'
import { HOUR_MS } from 'common/util/time'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { api } from 'web/lib/api/api'

/** Upcoming games per request; more load as the feed scrolls. */
export const SCHEDULE_PAGE_SIZE = 20
/** The endpoint's largest `limit`: a refresh re-reads at most this many. */
const MAX_SCHEDULE_LIMIT = 400
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
  // Everything loaded for this sport (see ScheduleFeed), kept in memory per
  // sport so switching back is instant. Tagged with its sport: the sport page
  // stays mounted when the URL moves to another sport, and the stored value
  // for the new one only arrives after a render.
  const [stored, setStored] = usePersistentInMemoryState<
    (ScheduleFeed & { sport: string }) | undefined
  >(undefined, `sports-feed-${sport}`)
  const feed = stored?.sport === sport ? stored : undefined
  const feedRef = useRef(feed)
  feedRef.current = feed
  const [loading, setLoading] = useState(false)
  // Plain state (not the persistent store): ticks arrive every few seconds
  // during live games and the overlay is cheap to rebuild from a refetch.
  const [live, setLive] = useState<Record<string, LiveGameState>>({})

  // Every refresh starts a new generation. A response from an older one (an
  // earlier refresh, another sport, a page loaded before the refresh) is
  // dropped rather than mixed in.
  const generation = useRef(0)

  // Re-reads every page loaded so far in one request, so the games and the
  // cursor come from the same read (see feedFromResponse).
  const refresh = useEvent(async () => {
    if (!enabled) return
    const gen = ++generation.current
    setLoading(true)
    try {
      const response = await api('sports-schedule', {
        sport,
        limit: refreshLimit(
          feedRef.current,
          SCHEDULE_PAGE_SIZE,
          MAX_SCHEDULE_LIMIT
        ),
      })
      if (gen !== generation.current) return
      // HTTP/client caches preserve the server's snapshot time. Request-start
      // time in the browser says nothing about how fresh that response is.
      setLive((prev) => pruneLiveForPage(prev, response))
      setStored({ ...feedFromResponse(response), sport })
    } catch (e) {
      console.error('Failed to load the sports schedule', e)
    } finally {
      if (gen === generation.current) setLoading(false)
    }
  })

  useEffect(() => {
    if (enabled) refresh()
  }, [sport, enabled])

  const loadingMore = useRef(false)
  const loadMore = useEvent(async () => {
    const current = feedRef.current
    const cursor = current?.cursor
    if (!current || !cursor || loadingMore.current) return false
    loadingMore.current = true
    const gen = generation.current
    try {
      const page = await api('sports-schedule', {
        sport,
        limit: SCHEDULE_PAGE_SIZE,
        cursor,
      })
      const latest = feedRef.current
      const next =
        gen === generation.current && latest
          ? appendPage(latest, cursor, page)
          : undefined
      // A refresh replaced the pages meanwhile: say there's more, so the
      // feed asks again from the refreshed cursor.
      if (!next || !latest) return !!feedRef.current?.cursor
      // Only the games the feed took from the page: see pruneLiveForPage.
      const adopted = adoptedGames(latest, page)
      setLive((prev) => pruneLiveForPage(prev, adopted))
      setStored({ ...next, sport })
      return !!next.cursor
    } catch (e) {
      console.error('Failed to load more sports games', e)
      return false
    } finally {
      loadingMore.current = false
    }
  })

  // The rail's sports, counts and live count cover every sport, whichever one
  // was asked for. Keep the latest across sport switches: a sport that hasn't
  // loaded yet would otherwise empty the rail, drop every count and reshuffle
  // the chips until its response arrives.
  const [lastRail, setLastRail] = usePersistentInMemoryState<
    SportsRailData | undefined
  >(undefined, 'sports-schedule-rail')
  const response = feed?.response
  useEffect(() => {
    if (!response) return
    setLastRail({
      sports: response.sports,
      counts: response.counts,
      liveCount: response.liveCount,
    })
  }, [response])
  const rail: SportsRailData | undefined = response
    ? {
        sports: response.sports,
        counts: response.counts,
        liveCount: response.liveCount,
      }
    : lastRail

  const games = feed?.games ?? []
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

  // Periodic refetch while the page is visible. Nothing else re-renders an
  // idle page, so the timer is what moves games from upcoming to live to
  // finished and discovers new ones.
  const hasActive = games.some(
    (g) =>
      g.status === 'live' ||
      (g.status === 'upcoming' && g.startTime - now < 4 * HOUR_MS)
  )
  useEffect(() => {
    if (!isPageVisible) return
    const ms = hasActive ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS
    const id = setInterval(() => refresh(), ms)
    return () => clearInterval(id)
  }, [hasActive, isPageVisible, sport])

  const merged: SportsScheduleResponse | undefined = useMemo(() => {
    if (!feed) return undefined
    return {
      ...feed.response,
      games: feed.games.map((g) =>
        applySportsLive(g, live[g.id], feed.snapshotTimes[g.id])
      ),
      nextCursor: feed.cursor,
    }
  }, [feed, live])

  return {
    schedule: merged,
    rail,
    loading: loading && !feed,
    refresh,
    loadMore,
    hasMore: !!feed?.cursor,
  }
}
