import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { BDL_LEAGUES, BdlLeagueKey } from 'common/bdl/leagues'
import { sportsFamilies, sportsFamily } from 'common/sports-navigation-family'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import {
  AnySportKey,
  SportInfo,
  sportPath,
  SportSelection,
} from 'common/sports-schedule'
import { Carousel } from 'web/components/widgets/carousel'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import { Row } from 'web/components/layout/row'
import { track } from 'web/lib/service/analytics'
import { SportNavIcon } from './sport-nav-icon'
import styles from './sports-navigation.module.css'
import {
  leagueRailChoices,
  sportsLeague,
  sportsView,
  sportsViewHref,
} from './sports-navigation'

// Tabs every sports page has. The first tab differs (Upcoming on /sports,
// Games on a sport), so switching sports from it opens the other one.
const SHARED_TABS = ['markets', 'leaderboards', 'topic']

/** Links between sports keep the open tab when the next page has it too. */
export function useSportHref() {
  const router = useRouter()
  const tab = router.query.tab
  const keep = typeof tab === 'string' && SHARED_TABS.includes(tab)
  return (sport: SportSelection) =>
    isSportsBdlEnabled()
      ? sportsViewHref(sport, sportsView(tab, router.query.sport))
      : sportPath(sport) + (keep ? `?tab=${tab}` : '')
}

export function LeagueRail(props: {
  sport: SportSelection
  leagues: BdlLeagueKey[]
}) {
  const { sport, leagues } = props
  const { query } = useRouter()
  const family = sportsFamily(sport)
  const implicit =
    sport !== family && leagues.length === 1 ? leagues[0] : undefined
  const active =
    query.league === undefined ? implicit : sportsLeague(query.league)
  const view = sportsView(query.tab, query.sport)
  const choices = leagueRailChoices(sport, leagues, active)
  return (
    <nav aria-label="Leagues" className="min-w-0">
      <Carousel
        className={styles.rail}
        revealActiveKey={active === null ? undefined : active ?? 'all'}
        labelsParentClassName="items-center gap-0.5 overscroll-x-contain sm:gap-[3px]"
        fadeEdges
        showArrowsOnHover
      >
        {[undefined, ...choices].map((key) => (
          <Link
            key={key ?? 'all'}
            href={sportsViewHref(family, view, key)}
            shallow={family === sport}
            scroll={false}
            aria-current={active === key ? 'page' : undefined}
            title={key ? BDL_LEAGUES[key].label : undefined}
            className="group flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-md text-xs focus-visible:outline-offset-[-2px]"
          >
            <span
              className={clsx(
                'rounded-[5px] px-2 py-1.5 leading-tight sm:px-[9px]',
                active === key
                  ? 'bg-canvas-50 text-ink-1000 font-bold'
                  : 'text-ink-600 group-hover:bg-ink-50 group-hover:text-ink-1000 font-medium'
              )}
            >
              {key ? BDL_LEAGUES[key].shortLabel : 'All leagues'}
            </span>
          </Link>
        ))}
      </Carousel>
    </nav>
  )
}

/**
 * The sports navigation: "All" opens the upcoming feed, every other chip its
 * sport's page. Sports with games on come first and carry their game count.
 */
export function SportRail(props: {
  sports: SportInfo[]
  selected: SportSelection
  counts: Partial<Record<AnySportKey, number>>
  className?: string
}) {
  const { className } = props
  const hrefFor = useSportHref()
  const grouped = isSportsBdlEnabled()
  const sports = grouped ? sportsFamilies(props.sports) : props.sports
  const selected = grouped ? sportsFamily(props.selected) : props.selected
  const counts: Partial<Record<AnySportKey, number>> = grouped
    ? Object.entries(props.counts).reduce<Record<string, number>>(
        (byFamily, [key, count]) => {
          const family = sportsFamily(key)
          byFamily[family] = (byFamily[family] ?? 0) + (count ?? 0)
          return byFamily
        },
        {}
      )
    : props.counts

  const visibleSports = sports.filter(
    (s) =>
      s.groupIds.length > 0 || (counts[s.key] ?? 0) > 0 || s.key === selected
  )
  const withGames = visibleSports.filter((s) => (counts[s.key] ?? 0) > 0)
  const withoutGames = visibleSports.filter(
    (s) => !(counts[s.key] ?? 0) && s.key !== 'other'
  )
  const totalGames = Object.values(counts).reduce<number>(
    (a, b) => a + (b ?? 0),
    0
  )
  const all = (
    <SportChip
      sport="all"
      href={hrefFor('all')}
      active={selected === 'all'}
      emoji="🏟️"
      label={grouped ? 'All sports' : 'All'}
      count={totalGames || undefined}
    />
  )

  return (
    <Row className={clsx('w-full items-center', className)}>
      {!grouped && (
        <Row className="bg-canvas-0 relative z-10 shrink-0 gap-1.5 py-2 pr-1.5">
          {all}
          <div className="bg-ink-200 my-auto h-5 w-px shrink-0" />
        </Row>
      )}
      <Carousel
        className={clsx('min-w-0 flex-1', grouped && styles.rail)}
        role={grouped ? 'navigation' : undefined}
        aria-label={grouped ? 'Sports' : undefined}
        revealActiveKey={grouped ? selected : undefined}
        labelsParentClassName={
          grouped
            ? 'items-center gap-px overscroll-x-contain sm:gap-[5px]'
            : 'gap-1.5 py-2'
        }
        fadeEdges
        showArrowsOnHover
      >
        {grouped && all}
        {withGames.map((s) => (
          <SportChip
            key={s.key}
            sport={s.key}
            href={hrefFor(s.key)}
            active={selected === s.key}
            emoji={s.emoji}
            label={s.label}
            count={counts[s.key]}
          />
        ))}
        {!grouped && withGames.length > 0 && withoutGames.length > 0 && (
          <div className="bg-ink-200 mx-1 my-auto h-5 w-px shrink-0" />
        )}
        {withoutGames.map((s) => (
          <SportChip
            key={s.key}
            sport={s.key}
            href={hrefFor(s.key)}
            active={selected === s.key}
            emoji={s.emoji}
            label={s.label}
          />
        ))}
      </Carousel>
      <DropdownMenu
        className={
          grouped ? 'border-ink-200 ml-1 shrink-0 border-l' : 'ml-1.5 shrink-0'
        }
        buttonClass={
          grouped
            ? 'hover:bg-ink-50 h-11 w-11 justify-center rounded-md'
            : 'border-ink-200 bg-canvas-0 hover:bg-canvas-50 min-h-[40px] gap-1 rounded-md border px-2 text-xs font-medium'
        }
        buttonContent={
          <>
            <span className={grouped ? 'sr-only' : undefined}>All sports</span>
            <ChevronDownIcon className="h-4 w-4" />
          </>
        }
        anchor={{ to: 'bottom end', gap: 8, padding: 8 }}
        menuWidth="w-56"
        menuItemsClass="!max-h-[60vh] overflow-y-auto"
        selectedItemName={selected}
        items={[
          { key: 'all', label: 'All sports', emoji: '🏟️' },
          ...visibleSports.filter((s) => s.key !== 'other'),
        ].map((s) => ({
          name: s.key,
          isLink: true,
          linkProps: {
            href: hrefFor(s.key),
            'aria-current': selected === s.key ? 'page' : undefined,
            onClick: () => track('sports rail select', { sport: s.key }),
          },
          icon: grouped ? (
            <SportNavIcon sport={s.key} />
          ) : (
            <span aria-hidden>{s.emoji}</span>
          ),
          buttonContent: <span>{s.label}</span>,
        }))}
      />
    </Row>
  )
}

function SportChip(props: {
  sport: SportSelection
  href: string
  active: boolean
  label: string
  emoji?: string
  count?: number
}) {
  const { sport, href, active, label, emoji, count } = props
  if (isSportsBdlEnabled())
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        onClick={() => track('sports rail select', { sport })}
        className="group flex min-h-[44px] shrink-0 snap-start items-center whitespace-nowrap rounded-md focus-visible:outline-offset-[-2px]"
      >
        <span
          className={clsx(
            'flex h-[34px] items-center gap-[5px] rounded-[7px] px-2.5 text-[13px] sm:h-[37px] sm:gap-[7px] sm:px-3 sm:text-sm',
            active
              ? 'bg-ink-1000 text-canvas-0 font-bold'
              : 'text-ink-600 group-hover:bg-ink-50 group-hover:text-ink-1000 font-semibold'
          )}
        >
          <SportNavIcon sport={sport} />
          {label}
        </span>
      </Link>
    )
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={() => track('sports rail select', { sport })}
      className={clsx(
        'flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-ink-900 bg-ink-900 text-ink-0'
          : 'border-ink-200 bg-canvas-0 text-ink-700 hover:border-ink-400 hover:bg-canvas-50'
      )}
    >
      {emoji && <span className="text-base leading-none">{emoji}</span>}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
            active ? 'bg-ink-0/20 text-ink-0' : 'bg-ink-100 text-ink-600'
          )}
        >
          {count}
        </span>
      )}
    </Link>
  )
}
