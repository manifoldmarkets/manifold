import { buildChartSeries } from './stat-metric'
import { StatsChart } from './stats-chart'
import { Point } from './stats-series'
import { useStatsTime } from './stats-time'

// DailyChart for /stats: one daily series, cut to the page's time range and
// drawn against the page's comparison window.
export function StatsDailyChart(props: {
  values: Point[]
  pct?: boolean
  label?: string
}) {
  const { values, pct, label = 'This period' } = props
  const { range, compare } = useStatsTime()
  const series = buildChartSeries({ label, values, range, compare })
  return <StatsChart series={series} pct={pct} ariaLabel={label} />
}
