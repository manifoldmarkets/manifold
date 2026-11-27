import dayjs from 'dayjs'
import { partition, sortBy, uniqBy } from 'lodash'

import { EsportsSeriesFacts } from 'common/esports/types'
import { Col } from 'web/components/layout/col'
import { groupByDay } from 'web/components/sports/game-feed-utils'
import { SectionHeader } from 'web/components/sports/schedule-list'
import { EsportsMarkets } from 'web/hooks/use-esports-tournaments'
import { SeriesRecord, SeriesRow } from './series-row'

type Section = {
  key: string
  label: string
  sublabel?: string
  accent?: boolean
  items: EsportsSeriesFacts[]
}

/**
 * Series day by day in the visitor's own time zone: what's live, then today
 * onwards, then series with no start time yet, then earlier days, latest first.
 */
export function SeriesList(props: {
  series: EsportsSeriesFacts[]
  markets: EsportsMarkets
  /** Records going into a series, by series id (Swiss pairings). */
  records?: Record<number, [SeriesRecord, SeriesRecord]>
  empty?: string
}) {
  const { markets, records, empty } = props
  const series = uniqBy(props.series, 'id')
  const [live, rest] = partition(series, (s) => s.status === 'in_progress')
  const [timed, untimed] = partition(rest, (s) => s.startTimeMs != null)
  const days: Section[] = groupByDay(
    sortBy(timed, 'startTimeMs', 'id'),
    (s) => s.startTimeMs ?? 0
  ).map((d) => ({ ...d, sublabel: dayjs(d.key).format('MMM D') }))
  const today = dayjs().format('YYYY-MM-DD')
  const [ahead, past] = partition(days, (d) => d.key >= today)
  const sections: Section[] = [
    { key: 'live', label: 'Live now', accent: true, items: live },
    ...ahead,
    { key: 'tba', label: 'Time to be announced', items: untimed },
    ...past.reverse(),
  ].filter((s) => s.items.length > 0)

  if (sections.length === 0)
    return empty ? <p className="text-ink-500 px-1 text-sm">{empty}</p> : null
  return (
    <Col className="gap-4">
      {sections.map((section) => (
        <Col key={section.key} className="gap-2">
          <SectionHeader
            label={section.label}
            sublabel={section.sublabel}
            accent={section.accent}
          />
          <Col className="border-ink-200 bg-canvas-0 divide-ink-100 divide-y overflow-hidden rounded-xl border">
            {section.items.map((s) => (
              <SeriesRow
                key={s.id}
                series={s}
                market={markets[s.id]}
                records={records?.[s.id]}
              />
            ))}
          </Col>
        </Col>
      ))}
    </Col>
  )
}
