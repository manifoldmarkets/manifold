import dayjs from 'dayjs'
import { useId, useMemo, useState } from 'react'
import { formatJustTime } from 'client-common/lib/time'
import {
  AnySportKey,
  SportInfo,
  UpcomingMarketRef,
} from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useHidesBlocked } from './blocked-topics'
import { MarketLoadError, RelatedMarketRow } from './game-related-markets'
import { groupByDay, SectionHeader } from './schedule-list'

/**
 * Sports markets closing in the next week that are not a game row and not
 * attached to one. For a sports market the close time is the game time, so
 * grouping by close date gives an "up next" list from what people made, with
 * no matching involved. This is most of the page until a league is connected.
 */
export function UpcomingMarkets(props: {
  refs: UpcomingMarketRef[]
  sport: AnySportKey | 'all'
  /** Tag each row with its sport (the All view). */
  showSport: boolean
  sportsByKey: Record<string, SportInfo>
}) {
  const { refs, sport, showSport, sportsByKey } = props
  const hides = useHidesBlocked()
  const [showAll, setShowAll] = useState(false)
  const listId = useId()
  const previewLimit = 6
  const ids = refs.map((r) => r.id)
  const { data, error, refresh } = useAPIGetter(
    'markets-by-ids',
    { ids },
    undefined,
    `sports-upcoming-${sport}`,
    ids.length > 0
  )
  const byId = useMemo(
    () => new Map((data ?? []).map((c) => [c.id, c] as const)),
    [data]
  )

  if (refs.length === 0) return null

  const available = refs.flatMap((ref) => {
    const contract = byId.get(ref.id)
    return contract && !hides(contract.groupSlugs) ? [{ ref, contract }] : []
  })
  const days = groupByDay(
    showAll ? available : available.slice(0, previewLimit),
    (row) => row.ref.closeTime
  )
  const loading = !data && !error

  return (
    <Col className="gap-2">
      <SectionHeader
        label="Closing this week"
        count={data ? available.length : refs.length}
        unit="market"
      />
      <Col id={listId} className="gap-3">
        {error && !data ? (
          <MarketLoadError refresh={refresh} />
        ) : loading ? (
          <Col className="border-ink-200 bg-canvas-0 divide-ink-100 divide-y rounded-lg border">
            {[0, 1, 2, 3, 4].slice(0, Math.min(5, refs.length)).map((i) => (
              <div key={i} className="px-3 py-2.5">
                <div className="bg-ink-100 h-4 w-3/4 animate-pulse rounded" />
              </div>
            ))}
          </Col>
        ) : (
          days.map((day) => {
            return (
              <Col key={day.key} className="gap-1">
                <DayLabel
                  label={day.label}
                  date={dayjs(day.items[0].ref.closeTime).format('MMM D')}
                />
                <Col className="border-ink-200 bg-canvas-0 divide-ink-100 divide-y rounded-lg border">
                  {day.items.map(({ ref, contract }) => (
                    <RelatedMarketRow
                      key={ref.id}
                      contract={contract}
                      prefix={
                        <Col className="w-14 shrink-0 items-start gap-0.5 pt-0.5">
                          <span className="text-ink-900 text-xs font-medium tabular-nums">
                            {formatJustTime(ref.closeTime).replace(':00', '')}
                          </span>
                          {showSport && (
                            <span
                              className="text-ink-400 max-w-full truncate text-[10px] font-semibold uppercase tracking-wide"
                              title={sportsByKey[ref.sport]?.longLabel}
                            >
                              {sportsByKey[ref.sport]?.label}
                            </span>
                          )}
                        </Col>
                      }
                    />
                  ))}
                </Col>
              </Col>
            )
          })
        )}
      </Col>
      {!loading && !error && !showAll && available.length > previewLimit && (
        <button
          type="button"
          aria-controls={listId}
          aria-expanded={false}
          onClick={() => setShowAll(true)}
          className="border-ink-200 text-primary-700 hover:bg-canvas-50 min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium"
        >
          Show all {available.length} closing markets
        </button>
      )}
    </Col>
  )
}

function DayLabel(props: { label: string; date: string }) {
  const { label, date } = props
  return (
    <div className="flex items-baseline gap-2 px-1">
      <span className="text-ink-700 text-xs font-semibold">{label}</span>
      <span className="text-ink-500 text-[11px]">{date}</span>
    </div>
  )
}
