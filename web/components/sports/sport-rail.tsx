import clsx from 'clsx'
import { SportKey, SPORT_CATEGORIES } from 'common/sports-schedule'
import { Carousel } from 'web/components/widgets/carousel'
import { track } from 'web/lib/service/analytics'

export type SportSelection = SportKey | 'all' | 'live'

/**
 * Horizontal chip rail for picking a sport, in the style of the league bars on
 * Polymarket / DraftKings. Sports with games on the schedule come first and
 * carry a count; a "Live" chip appears whenever something is in play.
 */
export function SportRail(props: {
  selected: SportSelection
  onSelect: (sport: SportSelection) => void
  counts: Partial<Record<SportKey, number>>
  liveCount: number
  className?: string
}) {
  const { selected, onSelect, counts, liveCount, className } = props

  const withGames = SPORT_CATEGORIES.filter((s) => (counts[s.key] ?? 0) > 0)
  const withoutGames = SPORT_CATEGORIES.filter(
    (s) => !(counts[s.key] ?? 0) && s.key !== 'other'
  )
  const totalGames = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)

  const select = (sport: SportSelection) => {
    track('sports rail select', { sport })
    onSelect(sport)
  }

  return (
    <Carousel
      className={clsx('w-full', className)}
      labelsParentClassName="gap-1.5 py-2"
      fadeEdges
      showArrowsOnHover
    >
      <SportChip
        active={selected === 'all'}
        onClick={() => select('all')}
        emoji="🏟️"
        label="All"
        count={totalGames || undefined}
      />
      {liveCount > 0 && (
        <SportChip
          active={selected === 'live'}
          onClick={() => select('live')}
          label="Live"
          count={liveCount}
          live
        />
      )}
      {withGames.map((s) => (
        <SportChip
          key={s.key}
          active={selected === s.key}
          onClick={() => select(s.key)}
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
          active={selected === s.key}
          onClick={() => select(s.key)}
          emoji={s.emoji}
          label={s.label}
        />
      ))}
    </Carousel>
  )
}

function SportChip(props: {
  active: boolean
  onClick: () => void
  label: string
  emoji?: string
  count?: number
  live?: boolean
}) {
  const { active, onClick, label, emoji, count, live } = props
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-ink-900 bg-ink-900 text-ink-0'
          : 'border-ink-200 bg-canvas-0 text-ink-700 hover:border-ink-400 hover:bg-canvas-50'
      )}
    >
      {live ? (
        <span
          className={clsx(
            'h-2 w-2 animate-pulse rounded-full',
            active ? 'bg-red-400' : 'bg-red-500'
          )}
        />
      ) : (
        emoji && <span className="text-base leading-none">{emoji}</span>
      )}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
            active
              ? 'bg-ink-0/20 text-ink-0'
              : live
              ? 'bg-red-500/10 text-red-600'
              : 'bg-ink-100 text-ink-600'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}
