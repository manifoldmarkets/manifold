import { sum } from 'lodash'
import Link from 'next/link'
import { useState } from 'react'
import toast from 'react-hot-toast'

import { ENV } from 'common/envs/constants'
import { SPORT_LEAGUE_LABEL, SPORTS_CALENDAR } from 'common/sports-calendar'
import {
  FINALS_INTERVALS,
  LIVE_INTERVALS,
  OddsApiUsageSummary,
  pollingTarget,
  ScorePollingPanel,
} from 'common/sports-score-polling'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { api } from 'web/lib/api/api'

// How often the resolver asks The Odds API for scores, and what it spends.
// Changes apply on the scheduler's next 10-second tick.
export function AdminScorePolling() {
  const { data, refresh } = useAPIGetter('admin-sports-score-polling', {})
  const [saving, setSaving] = useState<string | null>(null)

  if (!data) return <LoadingIndicator />

  const save = async (target: string, intervalSeconds: number | null) => {
    setSaving(target)
    try {
      await api('admin-sports-set-score-polling', { target, intervalSeconds })
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Col className="gap-6">
      <Credits usage={data.usage} />
      <LiveBySport data={data} saving={saving} save={save} />
      <Row className="flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-800 font-medium">Check for finals every</span>
        <IntervalSelect
          label="Finals check interval"
          options={FINALS_INTERVALS}
          value={data.finals.intervalSeconds}
          disabled={saving === pollingTarget.finals}
          onChange={(v) => save(pollingTarget.finals, v)}
        />
        <span className="text-ink-500 text-xs">
          from when a game is due to end (2 credits a check), so games resolve
          with live scores off. Every 30 minutes once a game is 3 hours overdue.
        </span>
      </Row>
      <GamesNow data={data} saving={saving} save={save} />
    </Col>
  )
}

function Credits(props: { usage: OddsApiUsageSummary }) {
  const { usage } = props
  const last7 = usage.byDay.slice(-7)
  const perDay = last7.length ? sum(last7.map((d) => d.credits)) / 7 : 0
  const max = Math.max(1, ...usage.byDay.map((d) => d.credits))
  return (
    <Col className="border-ink-200 gap-2 rounded-lg border p-3">
      <span className="text-ink-800 text-sm font-medium">
        The Odds API credits
      </span>
      {usage.remaining === null ? (
        <span className="text-ink-500 text-sm">
          No calls recorded yet. Usage appears after the next odds or scores
          call.
        </span>
      ) : (
        <>
          <span className="text-ink-900 text-sm">
            <strong>{usage.remaining.toLocaleString()}</strong> left
            {usage.used !== null &&
              ` · ${usage.used.toLocaleString()} used this period`}
            {usage.asOf && (
              <span className="text-ink-500">
                {' '}
                · as of {new Date(usage.asOf).toLocaleString()}
              </span>
            )}
          </span>
          <span className="text-ink-600 text-xs">
            {perDay > 0
              ? `Last 7 days: about ${Math.round(
                  perDay
                ).toLocaleString()} a day, so the rest lasts about ${Math.floor(
                  usage.remaining / perDay
                )} days at that rate.`
              : 'Nothing spent in the last 7 days.'}
          </span>
        </>
      )}
      {usage.byDay.length > 0 && (
        <Row className="h-10 items-end gap-0.5" aria-label="Credits per day">
          {usage.byDay.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.credits} credits`}
              className="bg-primary-300 w-3 rounded-sm"
              style={{ height: `${Math.max(4, (d.credits / max) * 100)}%` }}
            />
          ))}
        </Row>
      )}
      {usage.bySport.length > 0 && (
        <Col className="gap-0.5 text-xs">
          <span className="text-ink-500">Last 7 days by feed</span>
          {usage.bySport.map((s) => (
            <Row key={s.sportKey} className="gap-2">
              <span className="text-ink-800 w-56 truncate">
                {feedLabel(s.sportKey)}
              </span>
              <span className="text-ink-600 w-24">
                {s.credits.toLocaleString()} credits
              </span>
              <span className="text-ink-400">
                {s.calls.toLocaleString()} calls
              </span>
            </Row>
          ))}
        </Col>
      )}
    </Col>
  )
}

function LiveBySport(props: {
  data: ScorePollingPanel
  saving: string | null
  save: (target: string, intervalSeconds: number | null) => void
}) {
  const { data, saving, save } = props
  return (
    <Col className="gap-1">
      <span className="text-ink-800 text-sm font-medium">
        Live scores by sport
      </span>
      <span className="text-ink-500 text-xs">
        One call covers every game of a league that&apos;s on, so the cost is
        per league per hour of play, not per game. The provider updates scores
        about every 30 seconds.
        {ENV !== 'PROD' && ' On dev, live scores default to off.'}
      </span>
      {data.sports.map((s) => {
        const target = pollingTarget.sport(s.sport)
        return (
          <Row key={s.sport} className="items-center gap-3 py-1 text-sm">
            <span className="text-ink-900 w-36">
              {SPORT_LEAGUE_LABEL[s.sport]}
            </span>
            <IntervalSelect
              label={`${SPORT_LEAGUE_LABEL[s.sport]} live score interval`}
              options={LIVE_INTERVALS}
              value={s.intervalSeconds}
              disabled={saving === target}
              onChange={(v) => save(target, v)}
            />
            <span className="text-ink-500 text-xs">
              {creditsPerHour(s.intervalSeconds)}
              {s.isDefault && ' · default'}
            </span>
          </Row>
        )
      })}
    </Col>
  )
}

function GamesNow(props: {
  data: ScorePollingPanel
  saving: string | null
  save: (target: string, intervalSeconds: number | null) => void
}) {
  const { data, saving, save } = props
  const sportSeconds = Object.fromEntries(
    data.sports.map((s) => [s.sport, s.intervalSeconds])
  )
  return (
    <Col className="gap-1">
      <span className="text-ink-800 text-sm font-medium">
        Games on now or in the next 12 hours
      </span>
      <span className="text-ink-500 text-xs">
        Speed up one big game without changing its sport. It costs the same as
        changing the whole league, but only while that game is on.
      </span>
      {data.games.length === 0 && (
        <span className="text-ink-500 text-sm">No games in that window.</span>
      )}
      {data.games.map((g) => {
        const target = pollingTarget.game(g.contractId)
        const follows = g.sport ? sportSeconds[g.sport] : undefined
        return (
          <Row
            key={g.contractId}
            className="flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm"
          >
            <span className="text-ink-500 w-24 text-xs">
              {g.startTime <= Date.now()
                ? 'Started'
                : new Date(g.startTime).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
            </span>
            <Link
              href={`/ManifoldSports/${g.slug}`}
              className="text-ink-900 hover:text-primary-700 min-w-0 flex-1 truncate"
            >
              {g.question}
            </Link>
            <select
              aria-label={`Live score interval for ${g.question}`}
              className="border-ink-300 bg-canvas-0 rounded border px-2 py-1 text-sm"
              value={g.overrideSeconds ?? ''}
              disabled={saving === target}
              onChange={(e) =>
                save(
                  target,
                  e.target.value === '' ? null : Number(e.target.value)
                )
              }
            >
              <option value="">
                Same as sport
                {follows !== undefined ? ` (${intervalLabel(follows)})` : ''}
              </option>
              {LIVE_INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {intervalLabel(i)}
                </option>
              ))}
            </select>
          </Row>
        )
      })}
    </Col>
  )
}

function IntervalSelect(props: {
  label: string
  options: readonly number[]
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  const { label, options, value, disabled, onChange } = props
  return (
    <select
      aria-label={label}
      className="border-ink-300 bg-canvas-0 rounded border px-2 py-1 text-sm"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {options.map((i) => (
        <option key={i} value={i}>
          {intervalLabel(i)}
        </option>
      ))}
    </select>
  )
}

const intervalLabel = (seconds: number) =>
  seconds === 0 ? 'Off' : seconds < 60 ? `${seconds} s` : `${seconds / 60} min`

// A live poll costs 1 credit; once a game is due to end it costs 2.
const creditsPerHour = (seconds: number) =>
  seconds === 0
    ? 'Finals only'
    : `≈${Math.round(3600 / seconds)} credits an hour while a game is on`

// "soccer_epl" → "English Premier League (soccer_epl)".
const feedLabel = (sportKey: string) => {
  const entry = SPORTS_CALENDAR.find((e) => e.oddsKey === sportKey)
  const name = entry?.competition.replace(/\s+\d{4}([–-]\d{2,4})?$/, '')
  return name ? `${name} (${sportKey})` : sportKey
}
