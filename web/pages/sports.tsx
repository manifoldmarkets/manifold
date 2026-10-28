import { keyBy } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo } from 'react'
import { OG_CARD_HEIGHT, OG_CARD_WIDTH } from 'common/edge/og'
import { featuredRaceWeekends } from 'common/race-weekends'
import { SportsOgMarket, sportsOgImageAlt } from 'common/sports-og'
import {
  AnySportKey,
  CURATED_SPORTS,
  SPORT_KEY_RE,
} from 'common/sports-schedule'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { RaceWeekends } from 'web/components/sports/race-weekend-card'
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
import { loadSportsOgMarket } from 'web/lib/sports-og'

export async function getStaticProps() {
  return {
    props: { ogMarket: await loadSportsOgMarket() },
    revalidate: 60,
  }
}

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

export default function SportsPage({
  ogMarket,
}: {
  ogMarket: SportsOgMarket | null
}) {
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
  // An F1 weekend that's on or a few days away goes above the games.
  const weekends = featuredRaceWeekends(
    schedule?.raceWeekends ?? [],
    Date.now()
  )
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
      subheading="Pick a game. Make a call. Trade with the crowd."
      seo={{
        title: 'Sports',
        description:
          'Bet on every game: live odds and upcoming games across the NFL, NBA, MLB, soccer and more.',
        url: '/sports',
        // Encode the server snapshot so the image and its alt text agree, even
        // if a crawler requests the image after the featured game changes.
        ogProps: {
          endpoint: 'sports',
          props: ogMarket ? { market: JSON.stringify(ogMarket) } : {},
        },
        imageSize: { width: OG_CARD_WIDTH * 2, height: OG_CARD_HEIGHT * 2 },
        imageAlt: sportsOgImageAlt(ogMarket),
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
                <RaceWeekends weekends={weekends} className="mb-4" />
                <GameFeed
                  games={schedule?.games ?? []}
                  loading={loading || !schedule}
                  hasMore={hasMore}
                  loadMore={loadMore}
                  showLeague
                  empty={
                    <div className="flex flex-col gap-6">
                      {weekends.length === 0 && (
                        <NoGames sports={sports} counts={rail?.counts ?? {}} />
                      )}
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
