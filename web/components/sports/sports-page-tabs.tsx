import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { ScheduleGame, UpcomingMarketRef } from 'common/sports-schedule'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { uniqBy } from 'lodash'
import { ComponentProps } from 'react'
import {
  ControlledTabs,
  QueryUncontrolledTabs,
  Tab,
} from 'web/components/layout/tabs'
import { useHidesBlocked } from './blocked-topics'
import { GameRow } from './game-row'
import { GameFeed } from './schedule-list'
import {
  hasSportsResult,
  matchesGameLeague,
  sportsLeague,
  sportsView,
  sportsViewHref,
  SPORTS_VIEWS,
} from './sports-navigation'
import { MoreGames, SportsPicks } from './sports-picks'
import { SportMarkets } from './sports-shell'

type Feed = ComponentProps<typeof GameFeed>
type Markets = ComponentProps<typeof SportMarkets>

export function SportsPageTabs(props: {
  feed: Feed
  markets: Markets
  results?: ScheduleGame[]
  topicTabs: Tab[]
  trackingName: string
  sportKey: string
}) {
  const { feed, markets, topicTabs, trackingName } = props
  const router = useRouter()
  const hides = useHidesBlocked()
  const sport = props.sportKey
  if (!isSportsBdlEnabled()) {
    const all = sport === 'all'
    return (
      <QueryUncontrolledTabs
        trackingName={trackingName}
        tabs={[
          {
            title: all ? 'Upcoming' : 'Games',
            queryString: all ? 'upcoming' : 'games',
            content: (
              <div className="pt-3">
                <GameFeed {...feed} />
              </div>
            ),
          },
          {
            title: 'Markets',
            queryString: 'markets',
            content: (
              <div className="pt-3">
                <SportMarkets {...markets} />
              </div>
            ),
          },
          ...topicTabs,
        ]}
      />
    )
  }
  const view = sportsView(router.query.tab, router.query.sport)
  const league = sportsLeague(router.query.league)
  const tabHref = (next: typeof view) =>
    sportsViewHref(sport, next, router.query.league)
  const games = feed.games.filter((g) => matchesGameLeague(g, league))
  const weekends =
    league === undefined || league === 'f1' ? feed.raceWeekends ?? [] : []
  const refs = markets.upcoming.filter(
    (r) =>
      league === undefined || (league !== null && r.sportsLeagueKey === league)
  )
  const results = uniqBy([...games, ...(props.results ?? [])], 'id').filter(
    (g) =>
      hasSportsResult(g) && matchesGameLeague(g, league) && !hides(g.groupSlugs)
  )
  const scopedMarkets = (
    <SportMarkets {...markets} upcoming={refs} league={league} />
  )
  const raceRefs: UpcomingMarketRef[] = weekends.flatMap((w) =>
    w.sessions.flatMap((s) =>
      s.markets.map((m) => ({
        id: m.id,
        sport: w.sport,
        sportsLeagueKey: 'f1' as const,
        closeTime: s.closeTime,
      }))
    )
  )
  const allRefs = uniqBy([...refs, ...raceRefs], 'id')
  const extra = topicTabs.find((t) => t.queryString === view)
  const content = () => {
    if (league === null)
      return <p>Unknown league. Select All leagues to see this sport.</p>
    if (view === 'results') {
      if (feed.loading) return <p role="status">Loading results…</p>
      return results.length ? (
        results.map((g) => (
          <div key={g.id}>
            <p className="text-ink-600 mb-1 text-xs">
              {g.isResolved
                ? 'Market settled'
                : 'Final reported · Awaiting settlement'}
            </p>
            <GameRow game={g} variant="compact" showLeague />
          </div>
        ))
      ) : (
        <p>No recent results for this selection.</p>
      )
    }
    if (view === 'picks')
      return (
        <SportsPicks
          games={uniqBy([...games, ...results], 'id')}
          markets={{ ...markets, upcoming: allRefs, league }}
          loading={feed.loading}
          hasMore={feed.hasMore}
          loadMore={feed.loadMore}
        />
      )
    if (view === 'markets')
      return (
        <>
          {games.map((g) => (
            <GameRow key={g.id} game={g} variant="compact" showLeague />
          ))}
          {feed.loading ? (
            <p role="status">Loading markets…</p>
          ) : (
            games.length === 0 &&
            allRefs.length === 0 &&
            league !== undefined && <p>No upcoming markets for this league.</p>
          )}
          {feed.belowFeatured}
          <SportMarkets {...markets} upcoming={allRefs} league={league} />
          {feed.hasMore && <MoreGames load={feed.loadMore} />}
        </>
      )
    return (
      <GameFeed
        key={`${sport}:${league}:${view}`}
        {...feed}
        navigationView={view === 'live' ? 'live' : 'schedule'}
        games={games}
        raceWeekends={weekends}
        belowFeatured={
          league === undefined || league === 'f1'
            ? feed.belowFeatured
            : undefined
        }
        empty={
          view === 'live' ? (
            <p>No live events for this selection.</p>
          ) : league !== undefined ? (
            <>
              <p>No scheduled games for this league.</p>
              {scopedMarkets}
            </>
          ) : (
            feed.empty
          )
        }
      />
    )
  }
  const tabs: Tab[] = SPORTS_VIEWS.map(([key, title]) => ({
    title,
    queryString: key,
    content: null,
  }))
  if (extra) tabs.push(extra)
  const active = Math.max(
    0,
    tabs.findIndex((t) => t.queryString === view)
  )
  if (!extra)
    tabs[active].content = (
      <div className="text-ink-700 grid min-w-0 gap-3 pt-3">{content()}</div>
    )
  return (
    <>
      <ControlledTabs
        trackingName={trackingName}
        activeIndex={active}
        labelClassName="min-h-[44px]"
        onClick={(key) => {
          const next = sportsView(key)
          if (view !== next)
            void router.push(tabHref(next), undefined, {
              shallow: true,
              scroll: false,
            })
        }}
        tabs={tabs}
      />
      {topicTabs.length > 0 && (
        <nav
          aria-label="Sport topic tools"
          className="flex flex-wrap gap-x-4 px-1"
        >
          {topicTabs
            .filter((t) => t !== extra)
            .map((t) => (
              <Link
                key={t.queryString}
                href={tabHref(sportsView(t.queryString))}
                shallow
                scroll={false}
                className="text-primary-700 flex min-h-[44px] items-center text-sm"
              >
                {t.title}
              </Link>
            ))}
        </nav>
      )}
    </>
  )
}
