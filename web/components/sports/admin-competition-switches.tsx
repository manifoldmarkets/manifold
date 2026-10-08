import { groupBy } from 'lodash'
import { useState } from 'react'
import toast from 'react-hot-toast'

import { ENV } from 'common/envs/constants'
import {
  calendarPhaseKey,
  CompetitionSwitchState,
  SPORT_LEAGUE_LABEL,
  SportsCalendarStatus,
} from 'common/sports-calendar'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
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
  const [showFinished, setShowFinished] = useState(false)
  // Switches waiting on the API, by phase key, with the value asked for.
  const [pending, setPending] = useState<Record<string, boolean>>({})

  if (!data) return <LoadingIndicator />
  const finished = data.switches.filter((s) => s.status === 'completed')
  const shown = showFinished
    ? data.switches
    : data.switches.filter((s) => s.status !== 'completed')

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
        Ṁ1,000 each. Switching a phase off stops new games; markets already
        created still resolve.
        {ENV !== 'PROD' &&
          ' On dev every phase defaults to off: switch on only what you want to test.'}
      </p>
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
      {finished.length > 0 && (
        <button
          type="button"
          className="text-primary-700 self-start text-sm"
          onClick={() => setShowFinished((v) => !v)}
        >
          {showFinished ? 'Hide' : 'Show'} {finished.length} finished{' '}
          {finished.length === 1 ? 'phase' : 'phases'}
        </button>
      )}
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
