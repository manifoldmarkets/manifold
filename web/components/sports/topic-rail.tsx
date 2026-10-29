import clsx from 'clsx'
import Link from 'next/link'
import { SportSelection, SportsSubtopic } from 'common/sports-schedule'
import { Carousel } from 'web/components/widgets/carousel'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { track } from 'web/lib/service/analytics'
import { useSportHref } from './sport-rail'

/**
 * Every sport and every other topic under Sports (see SportsSubtopic), which
 * the sports pages show topics and their pages by. Undefined until it loads;
 * `failed` once a request for it has failed and nothing is loaded.
 */
export function useSportsIndex() {
  const { data, error } = useAPIGetter('sports-index', {})
  return {
    index: data && { sports: data.sports, topics: data.topics ?? [] },
    failed: !data && !!error,
  }
}

/**
 * The leagues, seasons and side topics under a sport (or the topics that
 * group sports, under All), each opening its own page. Biggest first, after
 * the sport itself; topics with games on carry their game count.
 */
export function TopicRail(props: {
  sport: SportSelection
  /** "All Soccer", "All sports". */
  sportLabel: string
  topics: SportsSubtopic[]
  /** The open topic's slug; none on the sport's own page. */
  selected?: string
  counts?: Record<string, number>
}) {
  const { sport, sportLabel, topics, selected, counts } = props
  const hrefFor = useSportHref()
  if (topics.length === 0) return null
  return (
    <Carousel
      className="-mt-1 min-w-0"
      labelsParentClassName="gap-1.5 py-1"
      fadeEdges
      showArrowsOnHover
    >
      <TopicChip
        href={hrefFor(sport)}
        active={!selected}
        label={`All ${sportLabel}`}
        onClick={() => track('sports topic select', { sport, topic: 'all' })}
      />
      {topics.map((t) => (
        <TopicChip
          key={t.id}
          href={hrefFor(sport, t.slug)}
          active={selected === t.slug}
          label={t.label}
          emoji={t.emoji}
          count={counts?.[t.id]}
          onClick={() => track('sports topic select', { sport, topic: t.slug })}
        />
      ))}
    </Carousel>
  )
}

function TopicChip(props: {
  href: string
  active: boolean
  label: string
  emoji?: string
  count?: number
  onClick: () => void
}) {
  const { href, active, label, emoji, count, onClick } = props
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={clsx(
        'flex min-h-[32px] shrink-0 snap-start items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary-300 bg-primary-50 text-primary-700'
          : 'border-ink-200 bg-canvas-0 text-ink-600 hover:border-ink-400 hover:bg-canvas-50'
      )}
    >
      {emoji && <span className="text-sm leading-none">{emoji}</span>}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
            active
              ? 'bg-primary-100 text-primary-700'
              : 'bg-ink-100 text-ink-600'
          )}
        >
          {count}
        </span>
      )}
    </Link>
  )
}
