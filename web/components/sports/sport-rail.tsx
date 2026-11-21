import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
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
 * The sports navigation: "All" opens the upcoming feed, every other chip its
 * sport's page. Sports with games on come first and carry their game count.
 */
export function SportRail(props: {
  sports: SportInfo[]
  selected: SportSelection
  counts: Partial<Record<AnySportKey, number>>
  className?: string
}) {
  const { sports, selected, counts, className } = props
  const hrefFor = useSportHref()

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

  return (
    <Row className={clsx('w-full items-center', className)}>
      {/* "All" stays pinned: it never scrolls away. */}
      <Row className="bg-canvas-0 relative z-10 shrink-0 gap-1.5 py-2 pr-1.5">
        <SportChip
          sport="all"
          href={hrefFor('all')}
          active={selected === 'all'}
          emoji="🏟️"
          label="All"
          count={totalGames || undefined}
        />
        <div className="bg-ink-200 my-auto h-5 w-px shrink-0" />
      </Row>
      <Carousel
        className="min-w-0 flex-1"
        labelsParentClassName="gap-1.5 py-2"
        fadeEdges
        showArrowsOnHover
      >
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
        {withGames.length > 0 && withoutGames.length > 0 && (
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
        className="ml-1.5 shrink-0"
        buttonClass="border-ink-200 bg-canvas-0 hover:bg-canvas-50 min-h-[40px] gap-1 rounded-md border px-2 text-xs font-medium"
        buttonContent={
          <>
            All sports <ChevronDownIcon className="h-4 w-4" />
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
          icon: <span aria-hidden>{s.emoji}</span>,
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
