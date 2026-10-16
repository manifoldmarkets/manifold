import clsx from 'clsx'
import { sum } from 'lodash'
import { NEWS_CATEGORIES, NewsCategory, NewsFeedCounts } from 'common/news-feed'
import { Row } from 'web/components/layout/row'
import { Carousel } from 'web/components/widgets/carousel'
import { track } from 'web/lib/service/analytics'

/**
 * The feed's navigation: "All" pinned, then one chip per category with the
 * number of stories that have a market. Chips combine: tap several to see
 * those categories together; "All" clears them. Mirrors the sports rail.
 */
export function CategoryRail(props: {
  /** The categories in the feed; empty means every category. */
  selected: NewsCategory[]
  onToggle: (category: NewsCategory | 'all') => void
  counts: NewsFeedCounts
  className?: string
}) {
  const { selected, onToggle, counts, className } = props
  const total = sum(Object.values(counts).map((n) => n ?? 0))
  const none = selected.length === 0

  return (
    <Row className={clsx('w-full items-center', className)}>
      <Row className="bg-canvas-0 relative z-10 shrink-0 gap-1.5 py-2 pr-1.5">
        <Chip
          active={none}
          emoji="📰"
          label="All"
          count={total || undefined}
          onClick={() => onToggle('all')}
        />
        <div className="bg-ink-200 my-auto h-5 w-px shrink-0" />
      </Row>
      <Carousel
        className="min-w-0 flex-1"
        labelsParentClassName="gap-1.5 py-2"
        fadeEdges
        showArrowsOnHover
      >
        {NEWS_CATEGORIES.map((c) => (
          <Chip
            key={c.key}
            active={selected.includes(c.key)}
            emoji={c.emoji}
            label={c.label}
            count={counts[c.key]}
            onClick={() => onToggle(c.key)}
          />
        ))}
      </Carousel>
    </Row>
  )
}

function Chip(props: {
  active: boolean
  label: string
  emoji?: string
  count?: number
  onClick: () => void
}) {
  const { active, label, emoji, count, onClick } = props
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        track('news feed rail select', { category: label })
        onClick()
      }}
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
    </button>
  )
}
