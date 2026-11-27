import { range, sortBy } from 'lodash'
import { RefObject, useEffect, useRef, useState } from 'react'

import { BracketColumn, BracketLane, BracketView } from 'common/esports/types'
import { Col } from 'web/components/layout/col'
import { EsportsMarkets } from 'web/hooks/use-esports-tournaments'
import { SeriesTile } from './series-tile'

const LANE_TITLE: Record<BracketLane, string> = {
  upper: 'Upper bracket',
  lower: 'Lower bracket',
  final: 'Final',
}

/**
 * A knockout stage, a column per round. A double elimination bracket has its
 * upper rounds over its lower ones, and the final beside both. A line joins
 * two series only where the provider's results show the winner of one playing
 * in the other; an empty slot is drawn only where the view counted one.
 * Wider than a phone, so it scrolls sideways inside its own frame.
 */
export function BracketBoard(props: {
  view: BracketView
  markets: EsportsMarkets
}) {
  const { view, markets } = props
  const frame = useRef<HTMLDivElement>(null)
  const paths = useLinkPaths(frame, view)
  const lane = (l: BracketLane) =>
    sortBy(
      view.columns.filter((c) => c.lane === l),
      (c) => c.order
    )
  const [upper, lower, final] = [lane('upper'), lane('lower'), lane('final')]
  const rounds = (columns: BracketColumn[], title?: string) =>
    columns.length > 0 && (
      <Col className="gap-1.5">
        {title && (
          <span className="text-ink-700 text-[11px] font-bold">{title}</span>
        )}
        <div className="flex flex-1 items-stretch gap-6">
          {columns.map((c) => (
            <Col key={`${c.lane}-${c.order}`} className="w-40 shrink-0 gap-1.5">
              <span className="text-ink-500 truncate text-[10px] font-bold uppercase tracking-wider">
                {c.label}
              </span>
              <Col className="flex-1 justify-around gap-2">
                {c.series.map((s) => (
                  <SeriesTile key={s.id} series={s} market={markets[s.id]} />
                ))}
                {range(Math.max(0, c.placeholders)).map((i) => (
                  <SeriesTile key={`open-${i}`} series={null} />
                ))}
              </Col>
            </Col>
          ))}
        </div>
      </Col>
    )

  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-1">
      <div ref={frame} className="relative flex w-max items-stretch gap-6">
        <svg
          aria-hidden
          className="text-ink-300 pointer-events-none absolute inset-0 h-full w-full"
        >
          {paths.map((d) => (
            <path key={d} d={d} fill="none" stroke="currentColor" />
          ))}
        </svg>
        <Col className="gap-4">
          {rounds(upper, lower.length > 0 ? LANE_TITLE.upper : undefined)}
          {rounds(lower, LANE_TITLE.lower)}
        </Col>
        {rounds(final, lower.length > 0 ? LANE_TITLE.final : undefined)}
      </div>
    </div>
  )
}

/**
 * An elbow from each series to the one its winner plays in, measured from the
 * tiles themselves and redrawn when the frame resizes. Tiles sit over the
 * lines. A loser's drop into the lower bracket isn't drawn: those lines
 * would run across every round between the two series.
 */
function useLinkPaths(
  frame: RefObject<HTMLDivElement | null>,
  view: BracketView
) {
  const [paths, setPaths] = useState<string[]>([])
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => {
      const origin = el.getBoundingClientRect()
      const box = (id: number) =>
        el.querySelector(`[data-series="${id}"]`)?.getBoundingClientRect()
      const next = view.links.flatMap((link) => {
        const from = link.carries === 'winner' ? box(link.from) : undefined
        const to = box(link.to)
        if (!from || !to || to.left <= from.right) return []
        const y1 = Math.round(from.top + from.height / 2 - origin.top) + 0.5
        const y2 = Math.round(to.top + to.height / 2 - origin.top) + 0.5
        const x1 = from.right - origin.left
        const x2 = to.left - origin.left
        return [`M${x1} ${y1}H${Math.round(x2 - 12) + 0.5}V${y2}H${x2}`]
      })
      setPaths((prev) => (prev.join() === next.join() ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [view])
  return paths
}
