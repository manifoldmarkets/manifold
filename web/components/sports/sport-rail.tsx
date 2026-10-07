import clsx from 'clsx'
import Link from 'next/link'
import { AnySportKey, SportInfo } from 'common/sports-schedule'
import { Carousel } from 'web/components/widgets/carousel'
import { Row } from 'web/components/layout/row'
import { track } from 'web/lib/service/analytics'

export type SportSelection = AnySportKey | 'all'

export const sportPath = (sport: SportSelection) =>
  sport === 'all' ? '/sports' : `/sports/${sport}`

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

  const withGames = sports.filter((s) => (counts[s.key] ?? 0) > 0)
  const withoutGames = sports.filter(
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
            active={selected === s.key}
            emoji={s.emoji}
            label={s.label}
          />
        ))}
      </Carousel>
    </Row>
  )
}

function SportChip(props: {
  sport: SportSelection
  active: boolean
  label: string
  emoji?: string
  count?: number
}) {
  const { sport, active, label, emoji, count } = props
  return (
    <Link
      href={sportPath(sport)}
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
