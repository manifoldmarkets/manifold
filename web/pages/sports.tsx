import { keyBy } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo } from 'react'
import { OG_CARD_HEIGHT, OG_CARD_WIDTH } from 'common/edge/og'
import { withoutRaceMarkets } from 'common/race-weekends'
import { SportsOgMarket, sportsOgImageAlt } from 'common/sports-og'
import {
  AnySportKey,
  CURATED_SPORTS,
  SPORT_KEY_RE,
  sportPath,
} from 'common/sports-schedule'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { GameFeed } from 'web/components/sports/schedule-list'
import {
  NoGames,
  SportMarkets,
  SportsShell,
} from 'web/components/sports/sports-shell'
import {
  ownTopicSlugs,
  shownCount,
  useBlockedTopicFilter,
  useLoadPastBlocked,
  useUnblockedSchedule,
} from 'web/components/sports/blocked-topics'
import { useSportTopicExtras } from 'web/components/sports/use-sport-topic'
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

const ALL = { sport: 'all' } as const

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
  const topic = useSportTopicExtras(ALL)
  // Topics the visitor blocked stay out of the feed.
  const hides = useBlockedTopicFilter(
    ownTopicSlugs('all', undefined, undefined)
  )
  // F1 sessions go in the feed among the games, each on its own day.
  const { games, weekends } = useUnblockedSchedule(
    schedule?.games,
    schedule?.raceWeekends,
    hides,
    sportsByKey
  )
  const lookingPastBlocked = useLoadPastBlocked({
    feed: 'all',
    shown: shownCount(games, weekends),
    loaded: schedule?.games.length ?? 0,
    hasMore,
    loadMore,
  })
  const markets = (
    <SportMarkets
      sport="all"
      upcoming={withoutRaceMarkets(schedule?.upcoming ?? [], weekends)}
      sportsByKey={sportsByKey}
      enabled={ready}
    />
  )

  return (
    <SportsShell
      selected="all"
      rail={rail}
      heading="Sports"
      subheading={
        topic.notice || 'Pick a game. Make a call. Trade with the crowd.'
      }
      actions={topic.follow}
      hides={hides}
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
                <GameFeed
                  games={games}
                  raceWeekends={weekends}
                  loading={loading || !schedule || lookingPastBlocked}
                  hasMore={hasMore}
                  loadMore={loadMore}
                  showLeague
                  empty={
                    <div className="flex flex-col gap-6">
                      <NoGames
                        sports={sports}
                        counts={rail?.counts ?? {}}
                        allBlocked={
                          shownCount(
                            schedule?.games ?? [],
                            schedule?.raceWeekends ?? []
                          ) > 0
                        }
                      />
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
          ...topic.tabs,
        ]}
      />
    </SportsShell>
  )
}
