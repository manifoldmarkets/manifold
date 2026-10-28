import clsx from 'clsx'
import { chunk, orderBy, sumBy } from 'lodash'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { Group } from 'common/group'
import {
  getCompareOffset,
  getComparePoints,
  getStatsWindow,
  hasComparableCoverage,
  shiftWindow,
  sliceWindow,
  StatsCompareKey,
  StatsWindow,
} from 'common/stats-window'
import { formatPercent } from 'common/util/format'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Input } from 'web/components/widgets/input'
import { getGroups } from 'web/lib/supabase/groups'
import { getTopicDayStats, TopicDayRow } from 'web/lib/supabase/stats'
import { Sparkline } from './sparkline'
import { ChartLegend } from './chart-legend'
import {
  compareText,
  describeChange,
  formatSince,
  MetricChange,
} from './stat-metric'
import {
  STATS_COMPARE_COLOR,
  STATS_SERIES_COLORS,
  StatsChart,
  StatsChartSeries,
} from './stats-chart'
import { Point, formatCount } from './stats-series'
import { useStatsTime } from './stats-time'

const MAX_SELECTED = STATS_SERIES_COLORS.length
const DEFAULT_SELECTED = 3
const TABLE_ROWS = 15

type TopicRow = {
  id: string
  group: Group | undefined
  avg: number
  // Days the topic cleared the floor, out of the range's days with topic data.
  daysCounted: number
  daysCovered: number
  share: number | undefined
  change: MetricChange | undefined
  changeRatio: number | undefined
  spark: number[]
}

type SortKey = 'active' | 'growing' | 'shrinking'

// Daily active traders per topic, as a ranked table for the selected range
// with the chosen topics charted above it. The topic counts aren't in the
// page's static props (they're most of daily_stats' size), so they load the
// first time the section opens and are kept for the session. A new reloadKey
// (the page's Reload button) fetches them again.
export function TopicActivity(props: { reloadKey: number }) {
  const { rows, failed } = useTopicDays(props.reloadKey)
  if (!rows)
    return (
      <p className="text-ink-500 bg-canvas-50 rounded-lg p-4 text-sm">
        {failed ? "Couldn't load topic stats." : 'Loading topic stats…'}
      </p>
    )
  return <TopicActivityBody stats={rows} />
}

let topicDaysRequest:
  | { reloadKey: number; rows: Promise<TopicDayRow[]> }
  | undefined
// While a reload is in flight, the rows already shown stay up.
const useTopicDays = (reloadKey: number) => {
  const [rows, setRows] = useState<TopicDayRow[]>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (topicDaysRequest?.reloadKey !== reloadKey)
      topicDaysRequest = { reloadKey, rows: getTopicDayStats() }
    const request = topicDaysRequest
    let cancelled = false
    setFailed(false)
    request.rows
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((e) => {
        console.error(e)
        // The next mount or Reload tries again.
        if (topicDaysRequest === request) topicDaysRequest = undefined
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])
  return { rows, failed }
}

function TopicActivityBody(props: { stats: TopicDayRow[] }) {
  const { stats } = props
  const { range, compare } = useStatsTime()
  const [sort, setSort] = usePersistentInMemoryState<SortKey>(
    'active',
    'stats-topics-sort'
  )
  const [measure, setMeasure] = usePersistentInMemoryState<'users' | 'share'>(
    'users',
    'stats-topics-measure'
  )
  const [selected, setSelected] = usePersistentInMemoryState<string[] | null>(
    null,
    'stats-topics-selected'
  )
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)

  // topicDays: site active traders on the days whose topic counts landed. Some
  // days have none (a failed stats run), and they must not count as zero.
  const { topicSeries, topicDays, siteDau } = useMemo(() => {
    const topicSeries: Record<string, Point[]> = {}
    const topicDays: Point[] = []
    for (const row of stats) {
      const daus = row.topic_daus
      if (!daus || typeof daus !== 'object' || Array.isArray(daus)) continue
      topicDays.push({ x: row.start_date, y: row.dau ?? 0 })
      for (const [id, v] of Object.entries(daus)) {
        if (id === 'date' || typeof v !== 'number' || !Number.isFinite(v))
          continue
        ;(topicSeries[id] ??= []).push({ x: row.start_date, y: v })
      }
    }
    const siteDau: Point[] = stats.flatMap((r) =>
      r.dau != null && Number.isFinite(r.dau)
        ? [{ x: r.start_date, y: r.dau }]
        : []
    )
    return { topicSeries, topicDays, siteDau }
  }, [stats])

  const groups = useTopicGroups(Object.keys(topicSeries))
  const lastDay = stats[stats.length - 1]?.start_date
  const window = lastDay ? getStatsWindow(lastDay, range) : undefined
  // Topic counts began on this day. Days before it aren't missing, they were
  // never counted, and a range reaching back past it says where they start.
  const firstTopicDay = topicDays[0]?.x
  const startsInRange =
    !!firstTopicDay && !!window && (!window.from || firstTopicDay > window.from)
  const missingDays = window
    ? sliceWindow(
        siteDau.filter((p) => !firstTopicDay || p.x >= firstTopicDay),
        window
      ).length - sliceWindow(topicDays, window).length
    : 0

  const rows = useMemo(
    () =>
      window
        ? getTopicRows(topicSeries, topicDays, groups, window, compare)
        : [],
    [topicSeries, topicDays, groups, window?.from, window?.to, compare]
  )

  // Sorting by change needs something to compare against: not on 'All', or
  // when the comparison window is too thin.
  const canSortByChange = rows.some((r) => r.changeRatio !== undefined)
  const effectiveSort = canSortByChange ? sort : 'active'
  const sorted =
    effectiveSort === 'active'
      ? orderBy(
          rows.filter((r) => r.avg > 0),
          (r) => r.avg,
          'desc'
        )
      : orderBy(
          rows.filter((r) => r.changeRatio !== undefined),
          (r) => r.changeRatio,
          effectiveSort === 'growing' ? 'desc' : 'asc'
        )
  const query = search.trim().toLowerCase()
  const filtered = query
    ? sorted.filter((r) =>
        (r.group?.name ?? r.id).toLowerCase().includes(query)
      )
    : sorted
  const visible = showAll || query ? filtered : filtered.slice(0, TABLE_ROWS)

  const selectedIds =
    selected ??
    orderBy(rows, (r) => r.avg, 'desc')
      .slice(0, DEFAULT_SELECTED)
      .map((r) => r.id)
  const toggle = (id: string) => {
    if (selectedIds.includes(id))
      setSelected(selectedIds.filter((s) => s !== id))
    else if (selectedIds.length < MAX_SELECTED)
      setSelected([...selectedIds, id])
  }
  // A topic whose group no longer exists was deleted.
  const nameOf = (id: string) =>
    groups ? groups[id]?.name ?? 'Deleted topic' : 'Loading…'

  // A topic's daily values as the table counts them: zero on days it was
  // under the floor, and no point on days with no topic counts at all.
  const topicValues = (id: string): Point[] => {
    const byDay = new Map((topicSeries[id] ?? []).map((p) => [p.x, p.y]))
    return topicDays.flatMap((d) => {
      const y = byDay.get(d.x) ?? 0
      if (measure === 'users') return [{ x: d.x, y }]
      return d.y > 0 ? [{ x: d.x, y: y / d.y }] : []
    })
  }
  const chartSeries: StatsChartSeries[] = window
    ? selectedIds.map((id, i) => ({
        key: id,
        label: nameOf(id),
        color: STATS_SERIES_COLORS[i % STATS_SERIES_COLORS.length],
        points: sliceWindow(topicValues(id), window),
      }))
    : []
  // One topic charted: draw its comparison too, as the other charts do.
  const offset = window ? getCompareOffset(window, compare) : undefined
  if (window && offset && selectedIds.length === 1)
    chartSeries.push({
      key: 'compare',
      label: compare === 'year' ? 'Last year' : 'Previous period',
      color: STATS_COMPARE_COLOR,
      points: getComparePoints(topicValues(selectedIds[0]), window, offset),
      dashed: true,
      shiftedDays: offset,
    })

  return (
    <Col className="gap-4">
      <Col className="bg-canvas-0 ring-ink-200 gap-3 rounded-lg p-4 ring-1">
        <Row className="flex-wrap items-start justify-between gap-2">
          <Col className="min-w-0">
            <h2 className="text-ink-900 text-lg font-semibold">
              Active traders by topic
            </h2>
            <p className="text-ink-500 text-sm">
              Pick up to {MAX_SELECTED} topics in the table to chart them.
            </p>
          </Col>
          <ChoicesToggleGroup
            ariaLabel="Measure"
            currentChoice={measure}
            choicesMap={{ Users: 'users', 'Share of all': 'share' }}
            setChoice={(v) => setMeasure(v === 'share' ? 'share' : 'users')}
            color="gray"
            toggleClassName="!px-2.5 !py-1 text-xs"
          />
        </Row>
        <StatsChart
          series={chartSeries}
          pct={measure === 'share'}
          ariaLabel="Active traders by topic"
        />
        <ChartLegend series={chartSeries} />
      </Col>

      <Col className="bg-canvas-0 ring-ink-200 gap-3 rounded-lg p-4 ring-1">
        <Row className="flex-wrap items-center gap-2">
          <Input
            type="search"
            placeholder="Search topics"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!h-9 w-full sm:w-56"
          />
          <div
            title={
              canSortByChange
                ? undefined
                : 'Pick a range other than All to sort by change'
            }
          >
            <ChoicesToggleGroup
              ariaLabel="Sort topics"
              currentChoice={effectiveSort}
              choicesMap={{
                'Most active': 'active',
                Growing: 'growing',
                Shrinking: 'shrinking',
              }}
              disabledOptions={canSortByChange ? [] : ['growing', 'shrinking']}
              setChoice={(v) =>
                setSort(v === 'growing' || v === 'shrinking' ? v : 'active')
              }
              color="gray"
              toggleClassName="!px-2.5 !py-1 text-xs"
            />
          </div>
        </Row>
        {/* Phones drop Share and Days so the table fits without scrolling. */}
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full text-sm tabular-nums sm:min-w-[34rem]">
            <thead>
              <tr className="border-ink-200 text-ink-600 border-b text-left">
                <th className="w-7 py-2" />
                <th className="py-2 pr-2 font-medium sm:pr-3">Topic</th>
                <th className="px-2 py-2 text-right font-medium sm:px-3">
                  Avg/day
                </th>
                <th
                  className="px-2 py-2 text-right font-medium sm:px-3"
                  title={compareText(range, compare)}
                >
                  Change
                </th>
                <th
                  className="hidden px-3 py-2 text-right font-medium sm:table-cell"
                  title="Share of all active traders"
                >
                  Share
                </th>
                <th
                  className="hidden px-3 py-2 text-right font-medium sm:table-cell"
                  title="Days the topic cleared 50 active traders"
                >
                  Days
                </th>
                <th className="py-2 pl-2 font-medium sm:pl-3">Trend</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const index = selectedIds.indexOf(r.id)
                const color =
                  index >= 0
                    ? STATS_SERIES_COLORS[index % STATS_SERIES_COLORS.length]
                    : undefined
                const full = index < 0 && selectedIds.length >= MAX_SELECTED
                return (
                  <tr
                    key={r.id}
                    className="border-ink-100 text-ink-800 border-b last:border-0"
                  >
                    <td className="py-2">
                      <input
                        type="checkbox"
                        aria-label={`Chart ${nameOf(r.id)}`}
                        checked={index >= 0}
                        disabled={full}
                        onChange={() => toggle(r.id)}
                        className="h-4 w-4 cursor-pointer rounded disabled:cursor-not-allowed"
                        style={color ? { accentColor: color } : undefined}
                      />
                    </td>
                    <td className="max-w-[9rem] truncate py-2 pr-2 sm:max-w-[14rem] sm:pr-3">
                      {r.group ? (
                        <Link
                          href={`/topic/${r.group.slug}`}
                          className="hover:text-primary-700 hover:underline"
                        >
                          {r.group.name}
                        </Link>
                      ) : (
                        <span className="text-ink-400">{nameOf(r.id)}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-medium sm:px-3">
                      {formatCount(r.avg)}
                    </td>
                    <td
                      className={clsx(
                        'px-2 py-2 text-right sm:px-3',
                        r.change?.direction === 'up'
                          ? 'text-teal-600'
                          : r.change?.direction === 'down'
                          ? 'text-scarlet-600'
                          : 'text-ink-500'
                      )}
                    >
                      {r.change?.text ?? '—'}
                    </td>
                    <td className="text-ink-600 hidden px-3 py-2 text-right sm:table-cell">
                      {r.share === undefined ? '—' : formatPercent(r.share)}
                    </td>
                    <td className="text-ink-500 hidden px-3 py-2 text-right text-xs sm:table-cell">
                      {r.daysCounted}/{r.daysCovered}
                    </td>
                    <td className="py-2 pl-2 sm:pl-3">
                      <Sparkline
                        values={r.spark}
                        className="text-ink-400 h-5 w-10 sm:w-16"
                      />
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-ink-500 py-4 text-center">
                    {query
                      ? 'No topics match.'
                      : 'No topic data in this range.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!query && filtered.length > TABLE_ROWS && (
          <Button
            color="gray-white"
            size="xs"
            className="self-start"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show fewer' : `Show all ${filtered.length} topics`}
          </Button>
        )}
        <p className="text-ink-400 text-xs">
          A topic&apos;s active traders are people who traded, commented or
          created a question in it. A topic is only counted on days it had more
          than 50, and counts as zero on other days, so smaller topics read low.
          Someone active in several topics counts in each, so shares add up to
          more than 100%.
          {range !== 'all' &&
            ` Change is ${compareText(
              range,
              compare === 'none' ? 'previous' : compare
            )}.`}
          {startsInRange &&
            firstTopicDay &&
            ` Topic counts begin ${formatSince(
              firstTopicDay
            )}, so this range's averages cover the days since.`}
          {missingDays > 0 &&
            ` Topic counts are missing for ${missingDays} day${
              missingDays === 1 ? '' : 's'
            } in this range, which are left out of the averages.`}
        </p>
      </Col>
    </Col>
  )
}

const getTopicRows = (
  topicSeries: Record<string, Point[]>,
  topicDays: Point[],
  groups: Record<string, Group> | undefined,
  window: StatsWindow,
  compare: StatsCompareKey
): TopicRow[] => {
  // Days in a window whose topic counts landed: the denominator for a daily
  // average, since a topic below the 50-trader floor that day has no entry
  // (a zero), while a day with no topic counts at all is unknown.
  const daysIn = (w: StatsWindow) => sliceWindow(topicDays, w).length
  const windowDays = daysIn(window)
  const siteTotal = sumBy(sliceWindow(topicDays, window), (p) => p.y)
  const offset = getCompareOffset(
    window,
    compare === 'none' ? 'previous' : compare
  )
  const before = offset ? shiftWindow(window, offset) : undefined
  const beforeDays = before ? daysIn(before) : 0
  const comparable = !!before && hasComparableCoverage(windowDays, beforeDays)

  const coveredDays = sliceWindow(topicDays, window)
  return Object.entries(topicSeries).flatMap(([id, series]) => {
    if (windowDays === 0) return []
    const points = sliceWindow(series, window)
    const total = sumBy(points, (p) => p.y)
    const avg = total / windowDays
    const beforeAvg =
      comparable && before
        ? sumBy(sliceWindow(series, before), (p) => p.y) / beforeDays
        : undefined
    // A topic that fell under the floor for the whole range is still a row
    // (at zero) when it had activity to compare against: the biggest drop.
    if (points.length === 0 && !(beforeAvg && beforeAvg > 0)) return []
    const byDay = new Map(points.map((p) => [p.x, p.y]))
    return [
      {
        id,
        group: groups?.[id],
        avg,
        daysCounted: points.length,
        daysCovered: windowDays,
        share: siteTotal > 0 ? total / siteTotal : undefined,
        change:
          beforeAvg === undefined
            ? undefined
            : beforeAvg > 0
            ? describeChange(false, avg, beforeAvg)
            : { text: 'New', direction: 'up' as const },
        changeRatio:
          beforeAvg === undefined
            ? undefined
            : beforeAvg > 0
            ? avg / beforeAvg - 1
            : Infinity,
        spark: coveredDays.map((d) => byDay.get(d.x) ?? 0),
      },
    ]
  })
}

// Topic names and slugs in a few batched reads, rather than one per topic.
const useTopicGroups = (ids: string[]) => {
  const key = ids.slice().sort().join(',')
  const [groups, setGroups] = useState<Record<string, Group>>()
  useEffect(() => {
    if (!key) return
    let cancelled = false
    Promise.all(chunk(key.split(','), 100).map(getGroups))
      .then((results) => {
        if (cancelled) return
        const byId: Record<string, Group> = {}
        for (const g of results.flat()) if (g) byId[g.id] = g
        setGroups(byId)
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [key])
  return groups
}
