import { useMemo } from 'react'

import {
  STAT_SURFACE_DEFINITIONS,
  STAT_SURFACES,
  StatSurface,
  isStatSurface,
} from 'common/stat-surfaces'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Title } from 'web/components/widgets/title'
import { ModActionBadge } from 'web/components/moderation/mod-action'
import { useAdmin } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { usePersistentQueriesState } from 'web/hooks/use-persistent-query-state'
import { getStats } from 'web/lib/supabase/stats'
import {
  ActivitySection,
  IdVerificationDay,
  STATS_SECTIONS,
  StatsSection,
  getActivityMetrics,
} from './activity-metrics'
import { MetricChartPanel } from './metric-chart-panel'
import { MetricTile } from './metric-tile'
import { StatMetric } from './stat-metric'
import { DailyStatsRow } from './stats-series'
import {
  SurfaceFunnelTable,
  getFunnelDays,
  getSurfaceFunnelMetrics,
} from './surface-funnels'

// Site activity as a picker instead of a column of charts: choose a section,
// then a metric tile, and the chart below shows that metric. The selection
// lives in the URL so a chart can be linked to.
export function StatsExplorer(props: {
  stats: DailyStatsRow[]
  setStats: (stats: DailyStatsRow[]) => void
  idVerifications?: IdVerificationDay[]
}) {
  const { stats, setStats, idVerifications } = props
  const isAdmin = useAdmin()
  const [query, setQuery] = usePersistentQueriesState(
    { section: 'users', metric: '', view: '', surface: 'sports' },
    'stats-explorer'
  )

  // Page funnels are internal metrics: only admins get the section, and its
  // data comes from an admin-only endpoint rather than the public stats.
  const sections = STATS_SECTIONS.filter((s) => s.key !== 'pages' || isAdmin)
  const section: StatsSection =
    sections.find((s) => s.key === query.section)?.key ?? 'users'
  const surface: StatSurface = isStatSurface(query.surface)
    ? query.surface
    : 'sports'

  const { data: funnelData, error: funnelError } = useAPIGetter(
    'get-surface-funnels',
    { limitDays: 120 },
    undefined,
    undefined,
    isAdmin && section === 'pages'
  )

  const activityMetrics = useMemo(
    () => getActivityMetrics({ stats, idVerifications, isAdmin }),
    [stats, idVerifications, isAdmin]
  )
  const funnelDays = useMemo(
    () => getFunnelDays(funnelData?.days ?? [], surface),
    [funnelData, surface]
  )
  const metrics: StatMetric[] =
    section === 'pages'
      ? getSurfaceFunnelMetrics(funnelDays, surface)
      : activityMetrics[section as ActivitySection]
  const metric = metrics.find((m) => m.key === query.metric) ?? metrics[0]

  return (
    <Col className="gap-4">
      <Row className="items-start justify-between gap-2">
        <Title className="!mb-0">Site activity</Title>
        <Button
          size="sm"
          color="gray-outline"
          onClick={() => getStats().then(setStats)}
        >
          Reload
        </Button>
      </Row>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ChoicesToggleGroup
          ariaLabel="Stats section"
          currentChoice={section}
          choicesMap={Object.fromEntries(sections.map((s) => [s.label, s.key]))}
          setChoice={(key) =>
            setQuery({ section: String(key), metric: '', view: '' })
          }
          color="gray"
          toggleClassName="whitespace-nowrap !px-3"
        />
      </div>

      {section === 'pages' && (
        <Col className="gap-2">
          <p className="text-ink-500 text-sm">
            <ModActionBadge admin className="mr-1 align-middle" />
            How many signed-in users reach each page, from its pill on the home
            page or anywhere else, and how many of them trade there. Only admins
            can see this section.
          </p>
          <ChoicesToggleGroup
            ariaLabel="Page"
            currentChoice={surface}
            choicesMap={Object.fromEntries(
              STAT_SURFACES.map((s) => [STAT_SURFACE_DEFINITIONS[s].label, s])
            )}
            setChoice={(key) => setQuery({ surface: String(key) })}
            color="indigo"
            className="self-start"
          />
        </Col>
      )}

      {section === 'pages' && funnelDays.length === 0 ? (
        <p className="text-ink-500 bg-canvas-50 rounded-lg p-4 text-sm">
          {funnelError
            ? `Couldn't load page funnels: ${funnelError.message}`
            : !funnelData
            ? 'Loading page funnels…'
            : 'No page funnel data yet. It fills in on the stats job’s next run.'}
        </p>
      ) : (
        metric && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {metrics.map((m) => (
                <MetricTile
                  key={m.key}
                  metric={m}
                  selected={m.key === metric.key}
                  onSelect={() => setQuery({ metric: m.key, view: '' })}
                />
              ))}
            </div>
            <MetricChartPanel
              metric={metric}
              viewKey={query.view}
              setViewKey={(view) => setQuery({ view })}
            />
            {section === 'pages' && <SurfaceFunnelTable days={funnelDays} />}
          </>
        )
      )}
    </Col>
  )
}
