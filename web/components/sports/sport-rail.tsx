import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useLayoutEffect, useRef } from 'react'
import {
  AnySportKey,
  SportInfo,
  sportPath,
  SportSelection,
} from 'common/sports-schedule'
import { Carousel } from 'web/components/widgets/carousel'
import DropdownMenu, {
  DropdownItem,
} from 'web/components/widgets/dropdown-menu'
import { Row } from 'web/components/layout/row'
import { track } from 'web/lib/service/analytics'

// Tabs every sports page has. The first tab differs (Upcoming on /sports,
// Games on a sport), so switching sports from it opens the other one.
const SHARED_TABS = ['markets', 'leaderboards', 'topic']

const ALL_SPORTS = { key: 'all', label: 'All sports', emoji: '🏟️' } as const

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
 * Every chip scrolls, "All" too, and the row keeps the open sport's chip in
 * the middle. The menu at the end names the open sport and jumps to any
 * sport, or back to All.
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
  const current =
    selected === 'all'
      ? ALL_SPORTS
      : visibleSports.find((s) => s.key === selected)
  const menuSports = [
    ALL_SPORTS,
    ...visibleSports.filter((s) => s.key !== 'other'),
  ]

  const centring = useCentredChip(
    selected,
    [...withGames, ...withoutGames].map((s) => s.key).join()
  )

  return (
    <Row className={clsx('w-full items-center', className)}>
      <div {...centring} className="min-w-0 flex-1">
        <Carousel
          labelsParentClassName="gap-1.5 py-2"
          fadeEdges
          showArrowsOnHover
        >
          <SportChip
            sport="all"
            href={hrefFor('all')}
            active={selected === 'all'}
            emoji={ALL_SPORTS.emoji}
            label="All"
            count={totalGames || undefined}
          />
          <div className="bg-ink-200 mx-1 my-auto h-5 w-px shrink-0" />
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
      </div>
      <DropdownMenu
        className="ml-1.5 shrink-0"
        buttonClass="border-ink-200 bg-canvas-0 hover:bg-canvas-50 !text-ink-700 min-h-[40px] gap-1 rounded-md border px-2 text-xs font-medium"
        buttonContent={(open) => (
          <>
            <span className="sr-only">Sport: </span>
            {current && (
              <span aria-hidden className="text-sm leading-none">
                {current.emoji}
              </span>
            )}
            {/* On phones the open sport's chip, kept in view beside the menu,
                names it: the menu shows its emoji, leaving the chips room. */}
            <span
              className={clsx(
                'max-w-[10rem] truncate',
                current ? 'sr-only sm:not-sr-only' : undefined
              )}
            >
              {current?.label ?? 'Sports'}
            </span>
            <ChevronDownIcon
              className={clsx(
                'h-4 w-4 shrink-0 transition-transform',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          </>
        )}
        anchor={{ to: 'bottom end', gap: 8, padding: 8 }}
        menuWidth="w-56"
        menuItemsClass="!max-h-[60vh] overflow-y-auto"
        selectedItemName={selected}
        items={menuSports.flatMap((s): DropdownItem[] => {
          const item: DropdownItem = {
            name: s.key,
            isLink: true,
            linkProps: {
              href: hrefFor(s.key),
              'aria-current': selected === s.key ? 'page' : undefined,
              onClick: () =>
                track('sports rail select', { sport: s.key, from: 'menu' }),
            },
            icon: <span aria-hidden>{s.emoji}</span>,
            buttonContent: <span>{s.label}</span>,
          }
          // All is the way home: set it apart from the sports.
          return s.key === 'all' && menuSports.length > 1
            ? [
                item,
                {
                  name: 'all-divider',
                  nonButtonContent: (
                    <div className="border-ink-100 my-1 border-t" />
                  ),
                },
              ]
            : [item]
        })}
      />
    </Row>
  )
}

/**
 * Scrolls the rail so the open sport's chip sits in the middle: at once on
 * first paint, then smoothly whenever the sport changes (from a chip, the
 * menu, or Back). The chips reorder when the sports load and as games start;
 * the row follows the chip then too, unless the visitor has scrolled it.
 */
function useCentredChip(selected: SportSelection, order: string) {
  const ref = useRef<HTMLDivElement>(null)
  const centredFor = useRef<SportSelection>()
  const touched = useRef(false)
  useLayoutEffect(() => {
    const moved = centredFor.current !== selected
    if (!moved && touched.current) return
    const chip = ref.current?.querySelector<HTMLElement>(
      `[data-sport-chip="${CSS.escape(selected)}"]`
    )
    const scroller = chip?.parentElement
    if (!chip || !scroller) return
    const chipBox = chip.getBoundingClientRect()
    const rowBox = scroller.getBoundingClientRect()
    const offset =
      chipBox.left + chipBox.width / 2 - (rowBox.left + rowBox.width / 2)
    if (Math.abs(offset) > 1)
      scroller.scrollBy({
        left: offset,
        behavior: moved && centredFor.current ? 'smooth' : 'instant',
      })
    centredFor.current = selected
    touched.current = false
  }, [selected, order])
  const touch = () => {
    touched.current = true
  }
  return { ref, onPointerDown: touch, onWheel: touch, onTouchStart: touch }
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
      data-sport-chip={sport}
      aria-current={active ? 'page' : undefined}
      onClick={() => track('sports rail select', { sport })}
      className={clsx(
        // Snap to the middle, where the open sport's chip is kept.
        'flex shrink-0 snap-center items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
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
