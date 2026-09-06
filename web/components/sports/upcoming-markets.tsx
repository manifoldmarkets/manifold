import dayjs from 'dayjs'
import { useMemo } from 'react'
import { formatJustTime } from 'client-common/lib/time'
import { Contract } from 'common/contract'
import {
  SPORT_BY_KEY,
  SportKey,
  UpcomingMarketRef,
} from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { RelatedMarketRow } from './game-related-markets'
import { groupByDay, SectionHeader } from './schedule-list'

/**
 * Sports markets closing in the next week that are not a game row and not
 * attached to one. For a sports market the close time is the game time, so
 * grouping by close date gives an "up next" list from what people made, with
 * no matching involved. This is most of the page until a league is connected.
 */
export function UpcomingMarkets(props: {
  refs: UpcomingMarketRef[]
  sport: SportKey | 'all'
  /** Tag each row with its sport (the All view). */
  showSport: boolean
}) {
  const { refs, sport, showSport } = props
  const ids = refs.map((r) => r.id)
  const { data, error } = useAPIGetter(
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

  const days = groupByDay(refs, (r) => r.closeTime)
  const loading = !data && !error

  return (
    <Col className="gap-2">
      <SectionHeader label="This week" count={refs.length} unit="market" />
      {loading ? (
        <Col className="border-ink-200 bg-canvas-0 divide-ink-100 divide-y rounded-lg border">
          {[0, 1, 2, 3, 4].slice(0, Math.min(5, refs.length)).map((i) => (
            <div key={i} className="px-3 py-2.5">
              <div className="bg-ink-100 h-4 w-3/4 animate-pulse rounded" />
            </div>
          ))}
        </Col>
      ) : (
        days.map((day) => {
          const rows = day.items
            .map((r) => ({ ref: r, contract: byId.get(r.id) }))
            .filter(
              (x): x is { ref: UpcomingMarketRef; contract: Contract } =>
                !!x.contract
            )
          if (rows.length === 0) return null
          return (
            <Col key={day.key} className="gap-1">
              <DayLabel
                label={day.label}
                date={dayjs(day.items[0].closeTime).format('ddd, MMM D')}
              />
              <Col className="border-ink-200 bg-canvas-0 divide-ink-100 divide-y rounded-lg border">
                {rows.map(({ ref, contract }) => (
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
                            className="text-ink-400 text-[10px] font-semibold uppercase tracking-wide"
                            title={SPORT_BY_KEY[ref.sport]?.longLabel}
                          >
                            {ref.sport === 'other'
                              ? ''
                              : SPORT_BY_KEY[ref.sport]?.label}
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
  )
}

function DayLabel(props: { label: string; date: string }) {
  const { label, date } = props
  return (
    <div className="flex items-baseline gap-2 px-1">
      <span className="text-ink-700 text-xs font-semibold">{label}</span>
      {(label === 'Today' || label === 'Tomorrow') && (
        <span className="text-ink-400 text-[11px]">{date}</span>
      )}
    </div>
  )
}
