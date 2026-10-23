import { groupBy, sortBy } from 'lodash'
import { useState } from 'react'
import toast from 'react-hot-toast'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { ENV } from 'common/envs/constants'
import {
  calendarPhaseKey,
  CompetitionSwitchState,
  countByReadiness,
  DEFAULT_SWITCH_FILTER,
  filterSwitches,
  SPORT_LEAGUE_LABEL,
  SportId,
  SportsCalendarStatus,
  SwitchFilter,
} from 'common/sports-calendar'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import ShortToggle from 'web/components/widgets/short-toggle'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { api } from 'web/lib/api/api'

// Which calendar phases the daily sports-odds-create job, and the Odds API
// dry run below, make game markets for. A switch overrides the phase's
// default in common/sports-calendar.ts.
export function AdminCompetitionSwitches() {
  const { data, refresh } = useAPIGetter(
    'admin-sports-competition-switches',
    {}
  )
  const [filter, setFilter] = usePersistentInMemoryState<SwitchFilter>(
    DEFAULT_SWITCH_FILTER,
    'admin-sports-switch-filter'
  )
  // Switches waiting on the API, by phase key, with the value asked for.
  const [pending, setPending] = useState<Record<string, boolean>>({})

  if (!data) return <LoadingIndicator />
  const shown = filterSwitches(data.switches, filter)
  const counts = countByReadiness(data.switches, filter)
  const finished = data.switches.filter((s) => s.status === 'completed')
  const sports = sortBy(
    Object.keys(groupBy(data.switches, (s) => s.sport)) as SportId[],
    (sport) => SPORT_LEAGUE_LABEL[sport]
  )

  const setOn = async (s: CompetitionSwitchState, on: boolean) => {
    const key = calendarPhaseKey(s)
    setPending((p) => ({ ...p, [key]: on }))
    try {
      await api('admin-sports-set-competition-switch', {
        competitionId: s.competitionId,
        phase: s.phase,
        on,
      })
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(({ [key]: _done, ...rest }) => rest)
    }
  }

  return (
    <Col className="gap-4">
      <p className="text-ink-500 text-sm">
        The daily job (6&nbsp;AM LA) creates the next two weeks&apos; games for
        every phase switched on here, up to 25 per competition per run, at
        Ṁ1,000 each. Switching a phase off stops new games, even where another
        phase&apos;s dates cover them; markets already created still follow the
        provider&apos;s kickoff and resolve.
        {ENV !== 'PROD' &&
          ' On dev every phase defaults to off: switch on only what you want to test.'}
      </p>
      <SwitchFilters
        filter={filter}
        setFilter={setFilter}
        counts={counts}
        sports={sports}
        finishedCount={finished.length}
      />
      <span className="text-ink-500 text-xs">
        Showing {shown.length} of {data.switches.length} phases.
        {filter.readiness === 'ready' && counts['needs-validation'] > 0 && (
          <>
            {' '}
            {counts['needs-validation']} need their settlement rule validated
            before they can run;{' '}
            <button
              type="button"
              className="text-primary-700"
              onClick={() =>
                setFilter({ ...filter, readiness: 'needs-validation' })
              }
            >
              show them
            </button>
            .
          </>
        )}
      </span>
      {shown.length === 0 && (
        <span className="text-ink-500 text-sm">
          No phases match.{' '}
          <button
            type="button"
            className="text-primary-700"
            onClick={() => setFilter(DEFAULT_SWITCH_FILTER)}
          >
            Reset the filters
          </button>
          .
        </span>
      )}
      {Object.entries(groupBy(shown, (s) => s.sport)).map(([sport, phases]) => (
        <Col key={sport} className="gap-1">
          <span className="text-ink-500 text-xs font-semibold uppercase tracking-wide">
            {SPORT_LEAGUE_LABEL[phases[0].sport]}
          </span>
          {phases.map((s) => {
            const key = calendarPhaseKey(s)
            return (
              <SwitchRow
                key={key}
                phase={s}
                on={pending[key] ?? s.on}
                busy={key in pending}
                setOn={(on) => setOn(s, on)}
              />
            )
          })}
        </Col>
      ))}
    </Col>
  )
}

// Readiness first: with every provider feed in the calendar, most phases are
// locked pending a settlement check, and an admin switching things on wants
// the ones that can run.
function SwitchFilters(props: {
  filter: SwitchFilter
  setFilter: (filter: SwitchFilter) => void
  counts: Record<SwitchFilter['readiness'], number>
  sports: SportId[]
  finishedCount: number
}) {
  const { filter, setFilter, counts, sports, finishedCount } = props
  const label = (text: string, readiness: SwitchFilter['readiness']) =>
    `${text} (${counts[readiness]})`
  return (
    <Col className="gap-2">
      <ChoicesToggleGroup
        currentChoice={filter.readiness}
        choicesMap={{
          [label('Ready', 'ready')]: 'ready',
          [label('On', 'on')]: 'on',
          [label('Needs validation', 'needs-validation')]: 'needs-validation',
          [label('All', 'all')]: 'all',
        }}
        setChoice={(v) =>
          setFilter({ ...filter, readiness: v as SwitchFilter['readiness'] })
        }
        color="indigo-dark"
        className="self-start"
        ariaLabel="Readiness"
      />
      <Row className="flex-wrap items-center gap-3">
        <select
          aria-label="Sport"
          value={filter.sport}
          onChange={(e) =>
            setFilter({ ...filter, sport: e.target.value as SportId | 'all' })
          }
          className="border-ink-300 bg-canvas-0 text-ink-900 rounded border px-2 py-1 text-sm"
        >
          <option value="all">All sports</option>
          {sports.map((sport) => (
            <option key={sport} value={sport}>
              {SPORT_LEAGUE_LABEL[sport]}
            </option>
          ))}
        </select>
        <Input
          type="search"
          aria-label="Search phases"
          placeholder="Search competitions"
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          className="h-8 w-56 text-sm"
        />
        {finishedCount > 0 && (
          <label className="text-ink-600 flex items-center gap-2 text-sm">
            <ShortToggle
              on={filter.showFinished}
              setOn={(showFinished) => setFilter({ ...filter, showFinished })}
              ariaLabel="Show finished phases"
            />
            Show {finishedCount} finished
          </label>
        )}
      </Row>
    </Col>
  )
}

function SwitchRow(props: {
  phase: CompetitionSwitchState
  on: boolean
  busy: boolean
  setOn: (on: boolean) => void
}) {
  const { phase: s, on, busy, setOn } = props
  return (
    <Row className="border-ink-100 items-start gap-3 border-b py-2 last:border-b-0">
      <ShortToggle
        on={on}
        setOn={setOn}
        disabled={busy || !!s.locked}
        ariaLabel={`Create ${s.competition} ${s.phase} games`}
        className="mt-0.5"
      />
      <Col className="min-w-0 gap-0.5">
        <Row className="flex-wrap items-baseline gap-x-2">
          <span className="text-ink-900 text-sm font-medium">
            {s.competition}
          </span>
          <span className="text-ink-600 text-sm">{s.phase}</span>
          <span className="text-ink-500 text-xs">
            {formatDay(s.startDate)} – {formatDay(s.endDate)}
          </span>
          <StatusPill status={s.status} />
        </Row>
        {s.locked && <span className="text-xs text-amber-600">{s.locked}</span>}
        {s.notes && <span className="text-ink-500 text-xs">{s.notes}</span>}
        {s.overlaps.length > 0 && (
          <span className="text-ink-500 text-xs">
            Shares dates with {s.overlaps.join(' and ')}: a game inside both is
            created only if both are on.
          </span>
        )}
        <span className="text-ink-400 text-xs">
          {s.updatedBy && s.updatedTime
            ? `Switched ${s.on ? 'on' : 'off'} by @${s.updatedBy}, ${new Date(
                s.updatedTime
              ).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })} · default ${s.defaultOn ? 'on' : 'off'}`
            : `Default: ${s.defaultOn ? 'on' : 'off'}`}
        </span>
      </Col>
    </Row>
  )
}

function StatusPill(props: { status: SportsCalendarStatus }) {
  const { status } = props
  const style =
    status === 'active'
      ? 'bg-teal-100 text-teal-700'
      : status === 'upcoming'
      ? 'bg-ink-100 text-ink-600'
      : 'bg-ink-100 text-ink-400'
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style}`}>
      {status === 'active'
        ? 'In season'
        : status === 'upcoming'
        ? 'Upcoming'
        : 'Finished'}
    </span>
  )
}

const formatDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
