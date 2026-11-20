import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { RaceWeekend } from 'common/race-weekends'
import { ScheduleGame, SportInfo } from 'common/sports-schedule'
import { usePrivateUser } from 'web/hooks/use-user'
import {
  blockedTopicFilter,
  HidesBlocked,
  shouldLoadPastBlocked,
  unblockedSchedule,
} from './blocked-topics-state'

export { ownTopicSlugs, shownCount } from './blocked-topics-state'
export type { HidesBlocked } from './blocked-topics-state'

const HidesContext = createContext<HidesBlocked>(() => false)

/**
 * A sports page's filter for the topics the visitor blocked: their markets
 * and games stay off the page, unless it's the page of that topic or one
 * under it (ownTopicSlugs).
 */
export function useBlockedTopicFilter(
  ownSlugs: readonly string[]
): HidesBlocked {
  const blocked = usePrivateUser()?.blockedGroupSlugs
  const key = `${(blocked ?? []).join(',')}|${ownSlugs.join(',')}`
  return useMemo(() => blockedTopicFilter(blocked, ownSlugs), [key])
}

/** Gives the lists on a sports page its filter (useHidesBlocked). */
export function HideBlockedTopics(props: {
  hides: HidesBlocked
  children: ReactNode
}) {
  const { hides, children } = props
  return <HidesContext.Provider value={hides}>{children}</HidesContext.Provider>
}

/** The page's filter for blocked topics, or one that keeps everything. */
export const useHidesBlocked = () => useContext(HidesContext)

/** The games and F1 weekends a page lists (unblockedSchedule). */
export function useUnblockedSchedule(
  games: ScheduleGame[] | undefined,
  weekends: RaceWeekend[] | undefined,
  hides: HidesBlocked,
  sportsByKey: Record<string, Pick<SportInfo, 'slug'>>
) {
  return useMemo(
    () => unblockedSchedule(games ?? [], weekends ?? [], hides, sportsByKey),
    [games, weekends, hides, sportsByKey]
  )
}

/**
 * Loads more of the feed while the visitor's blocks hide everything loaded so
 * far and there's more, so games past a blocked first page stay reachable.
 * Returns whether it's still looking.
 */
export function useLoadPastBlocked(props: {
  /** Which feed (a sport, or a topic under one): the page stays mounted across them. */
  feed: string
  /** Games and weekends the page shows (shownCount). */
  shown: number
  /** Games loaded. */
  loaded: number
  hasMore: boolean
  loadMore: () => Promise<boolean>
}) {
  const { feed, shown, loaded, hasMore, loadMore } = props
  // Where loading failed in this feed: don't retry until more has loaded
  // some other way.
  const [stuck, setStuck] = useState<{ feed: string; at: number }>()
  const stuckAt = stuck?.feed === feed ? stuck.at : undefined
  const looking = shouldLoadPastBlocked({ shown, loaded, hasMore, stuckAt })
  // Bumped whenever a load finishes, so one that loaded nothing (a refresh
  // replaced the pages meanwhile) is followed by another; three of those in
  // a row count as a failure.
  const [finished, setFinished] = useState(0)
  const inFlight = useRef(false)
  const latest = useRef({ feed, loaded })
  latest.current = { feed, loaded }
  const idle = useRef(0)
  // Progress, by any load, or a new feed starts the count again.
  useEffect(() => {
    idle.current = 0
  }, [feed, loaded])
  useEffect(() => {
    if (!looking || inFlight.current) return
    if (idle.current >= 3) {
      setStuck({ feed, at: loaded })
      return
    }
    inFlight.current = true
    loadMore()
      .then((more) => {
        if (!more) setStuck({ feed, at: loaded })
      })
      .catch(() => setStuck({ feed, at: loaded }))
      .finally(() => {
        inFlight.current = false
        // If the page took what it loaded, the render that follows resets
        // this (the effect above).
        const now = latest.current
        if (now.feed === feed && now.loaded === loaded) idle.current++
        setFinished((n) => n + 1)
      })
  }, [looking, loaded, feed, finished])
  return looking
}
