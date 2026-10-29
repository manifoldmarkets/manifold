import { createContext, ReactNode, useContext, useMemo } from 'react'
import { RaceWeekend } from 'common/race-weekends'
import { ScheduleGame, SportInfo } from 'common/sports-schedule'
import { usePrivateUser } from 'web/hooks/use-user'
import { blockedTopicFilter, HidesBlocked } from './blocked-topics-state'

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

/**
 * The games and F1 weekends a page lists, without blocked topics'. A weekend
 * goes by its sport's topic (Formula 1).
 */
export function useUnblockedSchedule(
  games: ScheduleGame[] | undefined,
  weekends: RaceWeekend[] | undefined,
  hides: HidesBlocked,
  sportsByKey: Record<string, Pick<SportInfo, 'slug'>>
) {
  return useMemo(
    () => ({
      games: (games ?? []).filter((g) => !hides(g.groupSlugs)),
      weekends: (weekends ?? []).filter((w) => {
        const slug = sportsByKey[w.sport]?.slug
        return !slug || !hides([slug])
      }),
    }),
    [games, weekends, hides, sportsByKey]
  )
}
