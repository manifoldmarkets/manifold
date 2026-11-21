import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ReactNode } from 'react'
import {
  ESPORTS_SPORT_KEY,
  ESPORTS_TITLES,
  esportsPath,
  EsportsTitleKey,
} from 'common/esports'
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
import { TitleMark } from './esports/esports-marks'

/** The two worlds the sports pages hold: the sports, and the esports. */
export type SportsWorld = 'sports' | 'esports'

/** The esports world's chips: open series per game. */
export interface EsportsRailData {
  selected: EsportsTitleKey | 'all'
  counts: Partial<Record<EsportsTitleKey, number>>
  total: number
}

// Tabs every sports page has. The first tab differs (Upcoming on /sports,
// Games on a sport), so switching sports from it opens the other one.
const SHARED_TABS = ['markets', 'leaderboards', 'topic']

/** Links between sports keep the open tab when the next page has it too. */
export function useSportHref() {
  const router = useRouter()
  const tab = router.query.tab
  const keep = typeof tab === 'string' && SHARED_TABS.includes(tab)
  return (sport: SportSelection) =>
    sportPath(sport) + (keep ? `?tab=${tab}` : '')
}

/**
 * The sports navigation. A switch between the two worlds stays pinned at the
 * start, and the chips are that world's: "All" then every sport with its
 * game count, or "All" then every game title with its open series. Ones
 * with something on come first and carry their count.
 */
export function SportRail(props: {
  sports: SportInfo[]
  selected: SportSelection
  counts: Partial<Record<AnySportKey, number>>
  world?: SportsWorld
  /** Esports' chips, and the switch's count of open series. */
  esports?: EsportsRailData
  className?: string
}) {
  const {
    sports,
    selected,
    counts,
    world = 'sports',
    esports,
    className,
  } = props
  const hrefFor = useSportHref()

  // Esports have a world of their own, so the Esports topic isn't a sport.
  const visibleSports = sports.filter(
    (s) =>
      s.key !== ESPORTS_SPORT_KEY &&
      (s.groupIds.length > 0 || (counts[s.key] ?? 0) > 0 || s.key === selected)
  )
  const withGames = visibleSports.filter((s) => (counts[s.key] ?? 0) > 0)
  const withoutGames = visibleSports.filter(
    (s) => !(counts[s.key] ?? 0) && s.key !== 'other'
  )
  const totalGames = Object.values(counts).reduce<number>(
    (a, b) => a + (b ?? 0),
    0
  )

  const titleCount = (key: EsportsTitleKey) => esports?.counts[key] ?? 0
  const titlesOn = ESPORTS_TITLES.filter((t) => titleCount(t.key) > 0)
  const titlesOff = ESPORTS_TITLES.filter((t) => !titleCount(t.key))
  const esportsSelected = esports?.selected ?? 'all'

  const divider = <div className="bg-ink-200 mx-1 my-auto h-5 w-px shrink-0" />
  const chips =
    world === 'sports' ? (
      <>
        <SportChip
          sport="all"
          href={hrefFor('all')}
          active={selected === 'all'}
          label="All"
          count={totalGames || undefined}
        />
        {withGames.map((s) => (
          <SportChip
            key={s.key}
            sport={s.key}
            href={hrefFor(s.key)}
            active={selected === s.key}
            icon={s.emoji}
            label={s.label}
            count={counts[s.key]}
          />
        ))}
        {withGames.length > 0 && withoutGames.length > 0 && divider}
        {withoutGames.map((s) => (
          <SportChip
            key={s.key}
            sport={s.key}
            href={hrefFor(s.key)}
            active={selected === s.key}
            icon={s.emoji}
            label={s.label}
          />
        ))}
      </>
    ) : (
      <>
        <SportChip
          sport={ESPORTS_SPORT_KEY}
          href={esportsPath()}
          active={esportsSelected === 'all'}
          label="All"
          count={esports?.total || undefined}
        />
        {[...titlesOn, ...titlesOff].map((t, i) => (
          <span key={t.key} className="flex shrink-0 items-center">
            {i === titlesOn.length && titlesOn.length > 0 && divider}
            <SportChip
              sport={`esports-${t.key}`}
              href={esportsPath(t.key)}
              active={esportsSelected === t.key}
              icon={<TitleMark title={t} />}
              label={t.short}
              count={titleCount(t.key) || undefined}
            />
          </span>
        ))}
      </>
    )

  const menuItems =
    world === 'sports'
      ? [
          { key: 'all', label: 'All sports', icon: '🏟️', href: hrefFor('all') },
          ...visibleSports
            .filter((s) => s.key !== 'other')
            .map((s) => ({
              key: s.key,
              label: s.label,
              icon: s.emoji as ReactNode,
              href: hrefFor(s.key),
            })),
        ]
      : [
          {
            key: 'all',
            label: 'All esports',
            icon: '🎮' as ReactNode,
            href: esportsPath(),
          },
          ...ESPORTS_TITLES.map((t) => ({
            key: t.key,
            label: t.name,
            icon: (<TitleMark title={t} />) as ReactNode,
            href: esportsPath(t.key),
          })),
        ]
  const menuSelected = world === 'sports' ? selected : esportsSelected

  return (
    <Row className={clsx('w-full items-center', className)}>
      {/* The world switch stays pinned: it never scrolls away. Phones have it
          under the heading instead, to leave the rail to the chips. */}
      <Row className="bg-canvas-0 relative z-10 hidden shrink-0 items-center gap-1.5 py-2 pr-1.5 sm:flex">
        <WorldSwitch
          world={world}
          sportsHref={hrefFor('all')}
          esportsCount={esports?.total}
        />
        <div className="bg-ink-200 my-auto h-5 w-px shrink-0" />
      </Row>
      <Carousel
        className="min-w-0 flex-1"
        labelsParentClassName="gap-1.5 py-2"
        fadeEdges
        showArrowsOnHover
      >
        {chips}
      </Carousel>
      <DropdownMenu
        className="ml-1.5 shrink-0"
        buttonClass="border-ink-200 bg-canvas-0 hover:bg-canvas-50 min-h-[40px] gap-1 rounded-md border px-2 text-xs font-medium"
        buttonContent={
          <>
            <span className="sr-only sm:not-sr-only">
              {world === 'sports' ? 'All sports' : 'All games'}
            </span>
            <ChevronDownIcon className="h-4 w-4" aria-hidden />
          </>
        }
        anchor={{ to: 'bottom end', gap: 8, padding: 8 }}
        menuWidth="w-56"
        menuItemsClass="!max-h-[60vh] overflow-y-auto"
        selectedItemName={menuSelected}
        items={menuItems.map((s) => ({
          name: s.key,
          isLink: true,
          linkProps: {
            href: s.href,
            'aria-current': menuSelected === s.key ? 'page' : undefined,
            onClick: () => track('sports rail select', { sport: s.key, world }),
          },
          icon: <span aria-hidden>{s.icon}</span>,
          buttonContent: <span>{s.label}</span>,
        }))}
      />
    </Row>
  )
}

/**
 * Sports or esports: one page, two worlds. Each side opens its world's "All".
 * From the sports side, a count says how many series are open in esports.
 */
export function WorldSwitch(props: {
  world: SportsWorld
  sportsHref: string
  esportsCount?: number
  /** Two equal halves across the width: the phone layout. */
  stretch?: boolean
  className?: string
}) {
  const { world, sportsHref, esportsCount, stretch, className } = props
  const side = (
    w: SportsWorld,
    href: string,
    emoji: string,
    label: string,
    badge?: number
  ) => {
    const active = world === w
    return (
      <Link
        href={href}
        aria-current={active ? 'true' : undefined}
        onClick={() => track('sports world select', { world: w })}
        className={clsx(
          'flex min-h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors',
          stretch && 'min-h-[38px] flex-1 justify-center',
          // A thumb on a track, unlike the chips: the world, not the sport.
          active
            ? 'bg-canvas-0 dark:bg-ink-300 text-ink-1000 ring-ink-900/5 shadow ring-1'
            : 'text-ink-500 hover:text-ink-1000'
        )}
      >
        <span aria-hidden className="text-base leading-none">
          {emoji}
        </span>
        {label}
        {!active && !!badge && (
          <span className="bg-primary-600 min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums text-white">
            {badge}
            <span className="sr-only"> open series</span>
          </span>
        )}
      </Link>
    )
  }
  return (
    <nav
      aria-label="Sports or esports"
      className={clsx(
        'bg-ink-100 flex shrink-0 items-center rounded-full p-0.5',
        className
      )}
    >
      {side('sports', sportsHref, '🏟️', 'Sports')}
      {side('esports', esportsPath(), '🎮', 'Esports', esportsCount)}
    </nav>
  )
}

function SportChip(props: {
  sport: SportSelection
  href: string
  active: boolean
  label: string
  /** An emoji, or a game's mark. */
  icon?: ReactNode
  count?: number
}) {
  const { sport, href, active, label, icon, count } = props
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
      {icon && <span className="text-base leading-none">{icon}</span>}
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
