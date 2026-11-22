import {
  createContext,
  ReactElement,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import {
  sportsEngagement,
  leagueChoices,
  scheduleLeagueCatalogue,
  leagueForSport,
  publishedGameLeagueKey,
} from 'common/bdl/league-navigation'
import { BdlLeagueKey } from 'common/bdl/leagues'
import type { SportsScheduleResponse } from 'common/sports-schedule'
import { useRouter } from 'next/router'

const preset = sportsEngagement([])
type Navigation = {
  engagement: typeof preset
  choices: BdlLeagueKey[]
  league?: BdlLeagueKey
  verifiedRaceIds: ReadonlySet<string>
  unverifiedTitles: boolean
  verifiedTitle: boolean
  unverified: boolean
  hiddenGames: (league: BdlLeagueKey, visibleIds: Set<string>) => boolean
  refresh?: () => Promise<void>
  chooseLeague: (value: string) => void
}
const Context = createContext<Navigation | null>(null)
export const useSportsNavigation = () => useContext(Context)

type NavigationProps = {
  fresh?: boolean
  refresh?: () => Promise<void>
  schedule?: SportsScheduleResponse
  sport: string
  hides?: (slugs: readonly string[] | undefined) => boolean
  children: ReactElement
}

export function SportsNavigation(props: NavigationProps) {
  return isSportsBdlEnabled() ? (
    <PersonalSportsNavigation {...props} />
  ) : (
    props.children
  )
}

function PersonalSportsNavigation({
  sport,
  hides,
  children,
  schedule,
  fresh,
  refresh,
}: NavigationProps) {
  const account = useUser()?.id
  const router = useRouter()
  const { data: taxonomy } = useAPIGetter(
    'sports-index',
    {},
    undefined,
    'sports-index',
    !!account
  )
  const [history, setHistory] = useState<{
    account: string
    markets: Parameters<typeof sportsEngagement>[0]
  }>()
  useEffect(() => {
    if (!account) return
    const controller = new AbortController()
    // This private endpoint returns distinct markets the account traded, liked or visited.
    // Keep only fields used to count league and topic activity.
    void api(
      'recent-markets',
      { topicSlug: 'recent', limit: 50 },
      { cache: 'no-store', signal: controller.signal }
    )
      .then((markets) => {
        if (!controller.signal.aborted)
          setHistory({
            account,
            markets: markets.map(
              ({
                id,
                creatorId,
                groupIds,
                groupSlugs,
                sportsEventId,
                sportsProvider,
                sportsFixture,
                sportsLeague,
                sportsLeagueKey,
                sportsMarketType,
              }: Parameters<typeof sportsEngagement>[0][number]) => ({
                id,
                creatorId,
                groupIds,
                groupSlugs,
                sportsEventId,
                sportsProvider,
                sportsFixture,
                sportsLeague,
                sportsLeagueKey,
                sportsMarketType,
              })
            ),
          })
      })
      .catch(() => {
        /* The preset order also works when history is unavailable. */
      })
    return () => controller.abort()
  }, [account])
  const engagement = useMemo(
    () =>
      history && history.account === account
        ? sportsEngagement(history.markets, taxonomy)
        : preset,
    [account, history, taxonomy]
  )
  const value = useMemo(() => {
    const { verifiedRaceIds, available, incomplete } =
      scheduleLeagueCatalogue(schedule)
    const choices = leagueChoices(sport, engagement.leagues, available)
    const requested = leagueForSport(router.query.league, sport)
    // Prior visits are useful to paint immediately, but cannot invalidate a bookmark.
    const league =
      requested && (!fresh || choices.includes(requested) || incomplete)
        ? requested
        : undefined
    const unverified = !!schedule && incomplete
    const hiddenGames = (target: BdlLeagueKey, visible: Set<string>) =>
      target === 'f1'
        ? !!schedule?.raceWeekends?.some(
            (w) =>
              hides?.(w.groupSlugs) &&
              w.sessions.some((s) =>
                s.markets.some((m) => verifiedRaceIds.has(m.id))
              )
          ) ||
          !!schedule?.raceChampionships?.some(
            (c) => verifiedRaceIds.has(c.id) && hides?.(c.groupSlugs)
          )
        : !!schedule?.games.some(
            (g) =>
              publishedGameLeagueKey(g) === target &&
              g.status !== 'finished' &&
              !visible.has(g.id)
          )
    const unverifiedTitles =
      schedule?.raceChampionships?.some((c) => !verifiedRaceIds.has(c.id)) ??
      false
    const verifiedTitle =
      schedule?.raceChampionships?.some(
        (c) => verifiedRaceIds.has(c.id) && !hides?.(c.groupSlugs)
      ) ?? false
    const chooseLeague = (value: string) => {
      const query = { ...router.query }
      if (value) query.league = value
      else delete query.league
      void router.push({ pathname: router.pathname, query }, undefined, {
        shallow: true,
        scroll: false,
      })
    }
    return {
      engagement,
      choices,
      league,
      chooseLeague,
      verifiedRaceIds,
      verifiedTitle,
      unverifiedTitles,
      unverified,
      hiddenGames,
      refresh,
    }
  }, [sport, hides, engagement, router, router.query, schedule, fresh, refresh])
  useEffect(() => {
    if (
      !router.isReady ||
      !schedule ||
      !fresh ||
      !router.query.league ||
      value.league
    )
      return
    const query = { ...router.query }
    delete query.league
    void router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
      scroll: false,
    })
  }, [
    router.isReady,
    router.pathname,
    router.query.league,
    schedule,
    value.league,
    fresh,
  ])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
