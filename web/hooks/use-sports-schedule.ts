import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useEvent } from 'client-common/hooks/use-event'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { SPORTS_SCHEDULE_PAGE_SIZE as SCHEDULE_PAGE_SIZE } from 'common/sports-game-feed'
import {
  AnySportKey,
  nextSportsObservationChange,
  SportsScheduleResponse,
} from 'common/sports-schedule'
import {
  adoptedGames,
  appendPage,
  pruneLiveForPage,
  refreshLoadedFeed,
  ScheduleFeed,
} from 'common/sports-schedule-feed'
import {
  applySportsLive,
  decodeSportsScoreTick,
  newerSportsScoreTick,
  LiveGameState,
} from 'common/sports-schedule-live'
import { HOUR_MS } from 'common/util/time'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { api } from 'web/lib/api/api'

/** The endpoint's largest `limit`: a refresh re-reads at most this many. */
const MAX_SCHEDULE_LIMIT = 400
/** Refetch cadence while something is live or about to startâ€¦ */
const ACTIVE_REFRESH_MS = 2 * 60_000
/** â€¦and while nothing is: still needed to pick up kickoffs, closes and new markets. */
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
export function useSportsSchedule(
  sport: AnySportKey | 'all',
  enabled = true,
  /** A topic under Sports (SportsSubtopic.id): only its games and markets. */
  topic?: string
) {
  // Everything loaded for this sport or topic (see ScheduleFeed), kept in
  // memory per page so switching back is instant. Tagged with what it's for:
  // the sport page stays mounted when the URL moves to another sport, and the
  // stored value for the new one only arrives after a render.
  const view = topic ? `${sport}/${topic}` : sport
  const [stored, setStored] = usePersistentInMemoryState<
    (ScheduleFeed & { sport: string }) | undefined
  >(undefined, `sports-feed-${view}`)
  const feed = stored?.sport === view ? stored : undefined
  const feedRef = useRef(feed)
  feedRef.current = feed
  const [loading, setLoading] = useState(false)
  const [viewClock, setViewClock] = useState(0)
  // Plain state (not the persistent store): ticks arrive every few seconds
  // during live games and the overlay is cheap to rebuild from a refetch.
  const [live, setLive] = useState<Record<string, LiveGameState>>({})

  // Every refresh starts a new generation. A response from an older one (an
  // earlier refresh, another sport, a page loaded before the refresh) is
  // dropped rather than mixed in.
  const generation = useRef(0)

  const refreshing = useRef(false)
  const refresh = useEvent(async () => {
    if (!enabled) return
    const gen = ++generation.current
    refreshing.current = true
    setLoading(true)
    try {
      const result = await refreshLoadedFeed(
        feedRef.current,
        SCHEDULE_PAGE_SIZE,
        MAX_SCHEDULE_LIMIT,
        (limit, cursor) =>
          api('sports-schedule', { sport, topic, limit, cursor }),
        () => gen === generation.current,
        isSportsBdlEnabled()
      )
      if (!result || gen !== generation.current) return
      setLive((prev) => result.pages.reduce(pruneLiveForPage, prev))
      setStored({ ...result.feed, sport: view })
    } catch (e) {
      console.error('Failed to load the sports schedule', e)
    } finally {
      if (gen === generation.current) {
        refreshing.current = false
        setLoading(false)
      }
    }
  })

  useEffect(() => {
    if (enabled) refresh()
    return () => {
      generation.current++
      refreshing.current = false
    }
  }, [view, enabled])

  const loadingMore = useRef(false)
  const loadMore = useEvent(async () => {
    const current = feedRef.current
    const cursor = current?.cursor
    if (
      !current ||
      !cursor ||
      loadingMore.current ||
      (isSportsBdlEnabled() && refreshing.current)
    )
      return false
    loadingMore.current = true
    const gen = generation.current
    try {
      const page = await api('sports-schedule', {
        sport,
        topic,
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
      setStored({ ...next, sport: view })
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
  const games = feed?.games ?? []
  const isPageVisible = useIsPageVisible()
  const now = Date.now()
  useEffect(() => {
    if (enabled && isPageVisible && isSportsBdlEnabled())
      setViewClock(Date.now())
  }, [enabled, isPageVisible])

  const topics = useMemo(() => {
    const out: string[] = []
    for (const g of games) {
      if (g.status === 'finished') continue
      out.push(`contract/${g.id}/updated-answers`)
      // The poller only broadcasts around kickoff, so the topic is idle until
      // then; subscribing early means the first in-play tick flips the row to
      // live without waiting for a refetch. Community games have no feed.
      if (g.kickoffKnown || (isSportsBdlEnabled() && g.sportsLeagueKey))
        out.push(`contract/${g.id}/sports-live`)
    }
    return out
  }, [
    games
      .map(
        (g) =>
          `${g.id}:${g.status}:${g.kickoffKnown}:${g.sportsLeagueKey ?? ''}`
      )
      .join(','),
  ])

  useApiSubscription({
    topics,
    enabled: topics.length > 0 && isPageVisible,
    onBroadcast: ({ topic, data }) => {
      const id = topic.split('/')[1]
      if (!id) return
      const at = data.broadcastTime as number | undefined
      if (topic.endsWith('/updated-answers')) {
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
        const tick = decodeSportsScoreTick(data, isSportsBdlEnabled())
        if (!tick) return
        setLive((prev) => {
          const liveScore = newerSportsScoreTick(
            prev[id]?.liveScore,
            tick,
            isSportsBdlEnabled()
          )
          return liveScore === prev[id]?.liveScore
            ? prev
            : {
                ...prev,
                [id]: { ...prev[id], liveScore },
              }
        })
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
  }, [hasActive, isPageVisible, view])

  const merged: SportsScheduleResponse | undefined = useMemo(() => {
    if (!feed) return undefined
    const at = Math.max(Date.now(), viewClock)
    const observed = isSportsBdlEnabled()
    let liveDelta = 0
    const games = feed.games.map((g) => {
      const displayed = applySportsLive(
        g,
        live[g.id],
        feed.snapshotTimes[g.id],
        observed,
        at
      )
      if (observed && g.sportsLeagueKey)
        liveDelta +=
          Number(displayed.status === 'live') - Number(g.status === 'live')
      return displayed
    })
    return {
      ...feed.response,
      games,
      liveCount: Math.max(0, feed.response.liveCount + liveDelta),
      nextCursor: feed.cursor,
    }
  }, [feed, live, viewClock])
  // Refetch can fail while the provider and socket are silent. Expire the local
  // receipt at its own deadline; this timer never fetches or resolves a market.
  useEffect(() => {
    if (!enabled || !isPageVisible || !isSportsBdlEnabled() || !merged) return
    const next = merged.games.reduce(
      (first, g) => Math.min(first, nextSportsObservationChange(g) ?? Infinity),
      Infinity
    )
    if (!Number.isFinite(next)) return
    const delay = Math.min(2_147_483_647, Math.max(0, next - Date.now()))
    const timer = setTimeout(() => setViewClock(Date.now()), delay)
    return () => clearTimeout(timer)
  }, [merged, enabled, isPageVisible])

  const sports = merged?.sports,
    counts = merged?.counts,
    liveCount = merged?.liveCount
  useEffect(() => {
    if (sports && counts && liveCount != null)
      setLastRail({ sports, counts, liveCount })
  }, [sports, counts, liveCount])
  const rail =
    sports && counts && liveCount != null
      ? { sports, counts, liveCount }
      : lastRail

  return {
    schedule: merged,
    rail,
    loading: loading && !feed,
    refresh,
    loadMore,
    hasMore: !!feed?.cursor,
  }
}
