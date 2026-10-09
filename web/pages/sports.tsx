import { keyBy } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo } from 'react'
import {
  AnySportKey,
  CURATED_SPORTS,
  SPORT_KEY_RE,
} from 'common/sports-schedule'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { GameFeed } from 'web/components/sports/schedule-list'
import { sportPath } from 'web/components/sports/sport-rail'
import {
  NoGames,
  SportMarkets,
  SportsShell,
} from 'web/components/sports/sports-shell'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useSportsSchedule } from 'web/hooks/use-sports-schedule'
import { useUser } from 'web/hooks/use-user'

// Sports were filters on this page (?sport=nfl, and ?tab=NFL before that).
// Each has its own page now; keep the old links working.
const LEGACY_TAB_TO_SPORT: Record<string, AnySportKey> = {
  nfl: 'nfl',
  nba: 'nba',
  epl: 'soccer',
  nhl: 'nhl',
  mlb: 'mlb',
}

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.toLowerCase()

export default function SportsPage() {
  const user = useUser()
  useSaveReferral(user)
  useSaveScroll('sports', true)
  const router = useRouter()

  const legacySport = useMemo((): AnySportKey | undefined => {
    if (!router.isReady) return undefined
    const sport = first(router.query.sport)
    if (
      sport &&
      sport !== 'all' &&
      sport !== 'live' &&
      SPORT_KEY_RE.test(sport)
    )
      return sport
    const tab = first(router.query.tab)
    return tab && Object.prototype.hasOwnProperty.call(LEGACY_TAB_TO_SPORT, tab)
      ? LEGACY_TAB_TO_SPORT[tab]
      : undefined
  }, [router.isReady, router.query.sport, router.query.tab])
  useEffect(() => {
    if (legacySport) router.replace(sportPath(legacySport))
  }, [legacySport])

  const ready = router.isReady && !legacySport
  const { schedule, rail, loading, loadMore, hasMore } = useSportsSchedule(
    'all',
    ready
  )
  const sports = rail?.sports ?? CURATED_SPORTS
  const sportsByKey = useMemo(() => keyBy(sports, 'key'), [sports])
  const markets = (
    <SportMarkets
      sport="all"
      upcoming={schedule?.upcoming ?? []}
      sportsByKey={sportsByKey}
      enabled={ready}
    />
  )

  return (
    <SportsShell
      selected="all"
      rail={rail}
      heading="Sports"
      subheading="Every game in the next two weeks, in kickoff order. Tap a price to bet."
      seo={{
        title: 'Sports',
        description:
          'Bet on every game: live odds and upcoming games across the NFL, NBA, MLB, soccer and more.',
        url: '/sports',
      }}
      trackPageView="/sports"
    >
      <QueryUncontrolledTabs
        trackingName="sports tabs"
        tabs={[
          {
            title: 'Upcoming',
            queryString: 'upcoming',
            content: (
              <div className="pt-3">
                <GameFeed
                  games={schedule?.games ?? []}
                  loading={loading || !schedule}
                  hasMore={hasMore}
                  loadMore={loadMore}
                  variant="list"
                  showLeague
                  empty={
                    <div className="flex flex-col gap-6">
                      <NoGames sports={sports} counts={rail?.counts ?? {}} />
                      {markets}
                    </div>
                  }
                />
              </div>
            ),
          },
          {
            title: 'Markets',
            queryString: 'markets',
            content: <div className="pt-3">{markets}</div>,
          },
        ]}
      />
    </SportsShell>
  )
}
