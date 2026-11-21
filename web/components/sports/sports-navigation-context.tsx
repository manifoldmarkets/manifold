import {
  createContext,
  ReactElement,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { sportsEngagement, leagueChoices } from 'common/bdl/league-navigation'
import { BdlLeagueKey, isBdlLeagueKey } from 'common/bdl/leagues'
import { useRouter } from 'next/router'

const preset = sportsEngagement([])
type Navigation = {
  engagement: typeof preset
  choices: BdlLeagueKey[]
  league?: BdlLeagueKey
  chooseLeague: (value: string) => void
}
const Context = createContext<Navigation | null>(null)
export const useSportsNavigation = () => useContext(Context)

export function SportsNavigation(props: {
  sport: string
  children: ReactElement
}) {
  return isSportsBdlEnabled() ? (
    <PersonalSportsNavigation {...props} />
  ) : (
    props.children
  )
}

function PersonalSportsNavigation({
  sport,
  children,
}: {
  sport: string
  children: ReactElement
}) {
  const account = useUser()?.id
  const router = useRouter()
  const [history, setHistory] = useState<{
    account: string
    engagement: typeof preset
  }>()
  useEffect(() => {
    if (!account) return
    const controller = new AbortController()
    // This private endpoint returns distinct markets the account traded, liked or visited.
    // Keep the result bounded and retain only navigation counts.
    void api(
      'recent-markets',
      { topicSlug: 'recent', limit: 50 },
      { cache: 'no-store', signal: controller.signal }
    )
      .then((markets) => {
        if (!controller.signal.aborted)
          setHistory({ account, engagement: sportsEngagement(markets) })
      })
      .catch(() => {
        /* The preset order also works when history is unavailable. */
      })
    return () => controller.abort()
  }, [account])
  const engagement =
    history && history.account === account ? history.engagement : preset
  const value = useMemo(() => {
    const choices = leagueChoices(sport, engagement.leagues)
    const requested = router.query.league
    const league =
      typeof requested === 'string' &&
      isBdlLeagueKey(requested) &&
      choices.includes(requested)
        ? requested
        : undefined
    const chooseLeague = (value: string) => {
      const query = { ...router.query }
      if (value) query.league = value
      else delete query.league
      void router.push({ pathname: router.pathname, query }, undefined, {
        shallow: true,
        scroll: false,
      })
    }
    return { engagement, choices, league, chooseLeague }
  }, [sport, engagement, router, router.query])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
