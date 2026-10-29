import { PlusIcon } from '@heroicons/react/solid'
import { sortBy } from 'lodash'
import Link from 'next/link'
import { ComponentProps, ReactNode } from 'react'
import {
  AnySportKey,
  CURATED_SPORTS,
  SportInfo,
  sportPath,
  SportSelection,
  UpcomingMarketRef,
} from 'common/sports-schedule'
import { BackButton } from 'web/components/contract/back-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { SportsRailData } from 'web/hooks/use-sports-schedule'
import { SportRail } from './sport-rail'
import { SportsMarketSections } from './sports-market-sections'
import { UpcomingMarkets } from './upcoming-markets'

/**
 * The frame every sports page shares: the heading, the sport navigation
 * (sticky), and a responsive game board or market columns under it.
 * The heading block is the same height on every sports page, so switching
 * sports never moves the rail or the content under it.
 */
export function SportsShell(props: {
  selected: SportSelection
  rail: SportsRailData | undefined
  heading: ReactNode
  /** One line; truncated rather than wrapped. */
  subheading?: ReactNode
  /** Beside Create, like the Follow button. */
  actions?: ReactNode
  /** Under the sport navigation: the sport's topics (TopicRail). */
  topics?: ReactNode
  seo: ComponentProps<typeof SEO>
  trackPageView: string
  children: ReactNode
}) {
  const {
    selected,
    rail,
    heading,
    subheading,
    actions,
    topics,
    seo,
    trackPageView,
    children,
  } = props
  return (
    <Page trackPageView={trackPageView} className="min-w-0">
      <SEO {...seo} />
      <Col className="w-full min-w-0 gap-3 px-3 pt-5 sm:px-6 sm:pt-7">
        <Row className="items-center justify-between gap-2 px-1">
          <Row className="min-w-0 items-center gap-1">
            {/* Goes back in history (to the previous sport, or wherever the
                visitor came from), or Home when they arrived from off-site.
                The button only appears once it can tell which, so it gets a
                fixed slot and the heading never moves. Remount when the sport
                changes so its history check stays current on Back/Forward.
                On desktop the sidebar covers it, so the slot is hidden too. */}
            <div className="-ml-2.5 h-8 w-10 shrink-0 lg:hidden">
              <BackButton key={selected} size="xs" homeFallback />
            </div>
            <h1 className="text-ink-1000 min-w-0 truncate text-3xl font-bold tracking-tight sm:text-4xl">
              {heading}
            </h1>
          </Row>
          <Row className="shrink-0 items-center gap-2">
            {actions}
            <Link
              href="/create"
              className="bg-primary-600 hover:bg-primary-700 text-ink-0 flex min-h-[40px] shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium"
            >
              <PlusIcon className="h-4 w-4" />
              <span>
                Create<span className="sr-only sm:not-sr-only"> market</span>
              </span>
            </Link>
          </Row>
        </Row>
        {/* Always one line, even while a sport is loading. */}
        <p className="text-ink-500 truncate px-1 text-sm">
          {subheading ?? '\u00a0'}
        </p>

        <div className="bg-canvas-0 border-ink-100 sticky top-0 z-20 -mx-3 border-b px-3 sm:-mx-6 sm:px-6">
          <SportRail
            sports={rail?.sports ?? CURATED_SPORTS}
            selected={selected}
            counts={rail?.counts ?? {}}
          />
        </div>
        {topics}

        {children}

        <p className="text-ink-400 px-1 pb-2 pt-4 text-[11px]">
          Times are in your local time zone. Official markets are created by
          @ManifoldSports; community markets are created by other users. Check
          each market's rules for how it resolves.
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
    // One column: in the site's standard 7-of-12 page column, a split would
    // leave each side about a phone's width, which the binary "Bet Yes / Bet
    // No" rows don't fit.
    <Col className="min-w-0 gap-6">
      <UpcomingMarkets
        key={sport === 'all' ? 'all' : sport.key}
        refs={upcoming}
        sport={sport === 'all' ? 'all' : sport.key}
        showSport={sport === 'all'}
        sportsByKey={sportsByKey}
      />
      <SportsMarketSections
        sport={sport}
        enabled={enabled}
        className="min-w-0"
      />
      <MakeAMarket sport={sport} />
    </Col>
  )
}

// Closes the Markets tab, and is all of it when a sport has nothing yet.
function MakeAMarket(props: { sport: SportInfo | 'all' }) {
  const { sport } = props
  const label = sport === 'all' ? 'sports' : sport.label
  // /create reads its prefill from a JSON `params` query value; `rand`
  // replaces a saved draft and applies the topic, as duplicating does.
  const slug = sport === 'all' ? 'sports-default' : sport.slug
  const params = {
    q: '',
    description: '',
    visibility: 'public',
    groupSlugs: [slug ?? 'sports-default'],
    rand: sport === 'all' ? 'sports' : sport.key.slice(0, 12),
  }
  return (
    <Row className="border-ink-200 bg-canvas-0 items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
      <Col className="min-w-0 gap-0.5">
        <span className="text-ink-900 text-sm font-semibold">
          Make your own {label} market
        </span>
        <span className="text-ink-500 text-xs">
          Futures, awards, props, side-bets: anything people can trade on.
        </span>
      </Col>
      <Link
        href={`/create?params=${encodeURIComponent(JSON.stringify(params))}`}
        className="bg-primary-600 hover:bg-primary-700 text-ink-0 flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium"
      >
        <PlusIcon className="h-4 w-4" /> Create
      </Link>
    </Row>
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
