import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
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

export { ownTopicSlugs } from './blocked-topics-state'
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
  /** Games and weekends the page shows. */
  shown: number
  /** Games loaded. */
  loaded: number
  hasMore: boolean
  loadMore: () => Promise<boolean>
}) {
  const { shown, loaded, hasMore, loadMore } = props
  // Where a load failed: don't retry until more has loaded some other way.
  const [stuckAt, setStuckAt] = useState<number>()
  const looking = shouldLoadPastBlocked({ shown, loaded, hasMore, stuckAt })
  useEffect(() => {
    if (!looking) return
    loadMore().then((more) => {
      if (!more) setStuckAt(loaded)
    })
  }, [looking, loaded])
  return looking
}
