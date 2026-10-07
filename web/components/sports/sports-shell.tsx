import { ChevronRightIcon, PlusIcon } from '@heroicons/react/solid'
import { sortBy } from 'lodash'
import Link from 'next/link'
import { ReactNode } from 'react'
import {
  AnySportKey,
  CURATED_SPORTS,
  SportInfo,
  UpcomingMarketRef,
} from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { SportsRailData } from 'web/hooks/use-sports-schedule'
import { SportRail, SportSelection, sportPath } from './sport-rail'
import { SportsMarketSections } from './sports-market-sections'
import { UpcomingMarkets } from './upcoming-markets'

/**
 * The frame every sports page shares: the heading, the sport navigation
 * (sticky), and one column of content under it.
 */
export function SportsShell(props: {
  selected: SportSelection
  rail: SportsRailData | undefined
  heading: ReactNode
  subheading?: ReactNode
  /** "Sports ›" above the heading, on a sport's page. */
  breadcrumb?: boolean
  seo: { title: string; description: string; url: string }
  trackPageView: string
  children: ReactNode
}) {
  const {
    selected,
    rail,
    heading,
    subheading,
    breadcrumb,
    seo,
    trackPageView,
    children,
  } = props
  return (
    <Page trackPageView={trackPageView} className="!col-span-10">
      <SEO title={seo.title} description={seo.description} url={seo.url} />
      <Col className="mx-auto w-full max-w-3xl gap-2 px-2 pt-3 sm:px-4">
        <Row className="items-end justify-between gap-2 px-1">
          <Col className="min-w-0 gap-0.5">
            {breadcrumb && (
              <Link
                href="/sports"
                className="text-ink-500 hover:text-primary-700 flex items-center gap-0.5 text-xs font-medium"
              >
                Sports
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Link>
            )}
            <h1 className="text-ink-1000 truncate text-2xl font-bold tracking-tight">
              {heading}
            </h1>
            {subheading && <p className="text-ink-500 text-sm">{subheading}</p>}
          </Col>
          <Link
            href="/create"
            className="bg-primary-600 hover:bg-primary-700 text-ink-0 hidden shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium sm:flex"
          >
            <PlusIcon className="h-4 w-4" /> Create market
          </Link>
        </Row>

        <div className="bg-canvas-0 border-ink-100 sticky top-0 z-20 -mx-2 border-b px-2 sm:-mx-4 sm:px-4">
          <SportRail
            sports={rail?.sports ?? CURATED_SPORTS}
            selected={selected}
            counts={rail?.counts ?? {}}
          />
        </div>

        {children}

        <p className="text-ink-400 px-1 pb-2 pt-4 text-[11px]">
          Times are in your local time zone. Game markets are created and
          resolved automatically by @ManifoldSports for connected leagues;
          anyone can add props and side-bets.
        </p>
      </Col>
    </Page>
  )
}

/**
 * Everything that isn't a game row: this week's other markets (props,
 * side-bets, events), what's trending, and the season-long futures.
 */
export function SportMarkets(props: {
  sport: SportInfo | 'all'
  upcoming: UpcomingMarketRef[]
  sportsByKey: Record<string, SportInfo>
  enabled: boolean
}) {
  const { sport, upcoming, sportsByKey, enabled } = props
  return (
    <Col className="gap-6">
      <UpcomingMarkets
        refs={upcoming}
        sport={sport === 'all' ? 'all' : sport.key}
        showSport={sport === 'all'}
        sportsByKey={sportsByKey}
      />
      <SportsMarketSections sport={sport} enabled={enabled} />
    </Col>
  )
}

/** Nothing live or upcoming: say so, and point at sports that do have games. */
export function NoGames(props: {
  sport?: SportInfo
  sports: SportInfo[]
  counts: Partial<Record<AnySportKey, number>>
}) {
  const { sport, sports, counts } = props
  const others = sortBy(
    sports.filter((s) => s.key !== sport?.key && (counts[s.key] ?? 0) > 0),
    (s) => -(counts[s.key] ?? 0)
  ).slice(0, 4)
  return (
    <Col className="border-ink-200 bg-canvas-0 gap-1.5 rounded-lg border px-4 py-4">
      <span className="text-ink-900 text-sm font-semibold">
        {sport
          ? `No ${sport.label} games in the next two weeks`
          : 'No games in the next two weeks'}
      </span>
      <span className="text-ink-500 text-xs">
        Game markets show up here automatically for connected leagues. Other
        markets are below.
      </span>
      {others.length > 0 && (
        <Row className="mt-1 flex-wrap gap-1.5 text-xs">
          {others.map((s) => (
            <Link
              key={s.key}
              href={sportPath(s.key)}
              className="border-ink-200 text-ink-600 hover:bg-canvas-50 rounded-full border px-2.5 py-1"
            >
              {s.emoji} {s.label}
              <span className="text-ink-400 ml-1 tabular-nums">
                {counts[s.key]}
              </span>
            </Link>
          ))}
        </Row>
      )}
    </Col>
  )
}
