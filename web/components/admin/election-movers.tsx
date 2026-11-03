import clsx from 'clsx'
import { chunk } from 'lodash'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { formatPercent } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { api } from 'web/lib/api/api'
import {
  addTrades,
  Choice,
  leaderChange,
  movesSince,
  OFFICE_LABEL,
  resolvedSince,
  ResolveUnit,
  TradeStore,
} from 'web/lib/politics/election-resolve-model'

const MINUTE = 60_000
const WINDOWS = [
  { label: '1m', ms: MINUTE },
  { label: '5m', ms: 5 * MINUTE },
  { label: '10m', ms: 10 * MINUTE },
  { label: '30m', ms: 30 * MINUTE },
  { label: '1h', ms: 60 * MINUTE },
  { label: '6h', ms: 6 * 60 * MINUTE },
  { label: '24h', ms: 24 * 60 * MINUTE },
]
const MIN_CHANGES = [0, 0.01, 0.02, 0.05, 0.1]
// The control strip, in this order, by unit race label.
const CONTROL_RACES = ['Senate control', 'House control', 'Balance of power']

// Every map market's moves over a recent window, from its trades: what
// rose, from what to what, and on how many trades. Biggest gain first.
export function ElectionMovers(props: {
  units: ResolveUnit[]
  trades: ElectionTrades
  choices: Record<string, Choice>
  onToggle: (unit: ResolveUnit, on: boolean) => void
}) {
  const { units, trades, choices, onToggle } = props
  const [windowMs, setWindowMs] = useState(5 * MINUTE)
  const [minChange, setMinChange] = useState(0.01)
  const { ensureCovered } = trades

  useEffect(() => {
    ensureCovered(Date.now() - windowMs)
  }, [windowMs, ensureCovered])

  const now = trades.updatedAt ?? Date.now()
  const since = now - windowMs
  const ready =
    trades.coveredSince !== undefined && trades.coveredSince <= since
  const store = trades.store.current
  const moves = useMemo(
    () => (ready ? movesSince(units, store, since, minChange) : []),
    // trades.version changes whenever the store does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, units, since, minChange, trades.version]
  )
  const resolved = ready ? resolvedSince(units, since) : []
  const controls = CONTROL_RACES.flatMap((race) => {
    const unit = units.find((u) => u.office === 'headline' && u.race === race)
    return unit ? [{ unit, ...leaderChange(unit, store, since) }] : []
  })

  return (
    <Col className="border-ink-200 bg-canvas-0 gap-2 rounded-lg border p-3">
      <Row className="flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-semibold">Recent movers</span>
        <Row className="gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              onClick={() => setWindowMs(w.ms)}
              className={clsx(
                'rounded px-2 py-0.5 text-xs font-medium tabular-nums',
                windowMs === w.ms
                  ? 'bg-ink-900 text-canvas-0'
                  : 'bg-ink-100 text-ink-700'
              )}
            >
              {w.label}
            </button>
          ))}
        </Row>
        <label
          htmlFor="er-min-move"
          className="text-ink-600 flex items-center gap-1 text-xs"
        >
          Min move
          <Select
            id="er-min-move"
            className="!h-7 !py-0 !pl-2 !pr-7 !text-xs"
            value={minChange}
            onChange={(e) => setMinChange(Number(e.target.value))}
          >
            {MIN_CHANGES.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'any' : `${Math.round(m * 100)} pts`}
              </option>
            ))}
          </Select>
        </label>
        <span className="text-ink-500 text-xs">
          {!ready
            ? 'Loading trades…'
            : `Since ${etTime(since)} · ${moves.length} moved`}
          {trades.error && (
            <span className="text-scarlet-600 ml-2">{trades.error}</span>
          )}
        </span>
      </Row>

      {ready && (
        <Row className="flex-wrap gap-2 text-xs">
          {controls.map(({ unit, option, from, to }) => (
            <span
              key={unit.key}
              className="bg-canvas-50 border-ink-200 rounded border px-2 py-0.5"
            >
              <span className="font-semibold">{unit.race}</span>{' '}
              {controlLabel(unit, option.value, option.label)}{' '}
              <span className="tabular-nums">{formatPercent(to)}</span>{' '}
              <Delta d={to - from} />
            </span>
          ))}
        </Row>
      )}

      {ready && resolved.length > 0 && (
        <div className="text-xs">
          <span className="font-semibold">Resolved in window:</span>{' '}
          {resolved
            .map(
              (u) =>
                `${u.race}${u.answerText ? ` (${u.answerText})` : ''} → ${
                  u.resolutionLabel === 'CANCEL' ? 'N/A' : u.resolutionLabel
                }`
            )
            .join(' · ')}
        </div>
      )}

      <div className="border-ink-100 max-h-[22rem] overflow-auto rounded border">
        <table className="w-full text-xs">
          <thead className="text-ink-500 bg-canvas-50 sticky top-0 text-left">
            <tr>
              <th className="w-6 px-2 py-1"></th>
              <th className="px-2 py-1">Race</th>
              <th className="px-2 py-1">Market</th>
              <th className="px-2 py-1">Rose</th>
              <th className="px-2 py-1 text-right">Then → now</th>
              <th className="px-2 py-1 text-right">Change</th>
              <th className="px-2 py-1 text-right">Trades</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((m) => (
              <tr key={m.unit.key} className="border-ink-100 border-t">
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    aria-label={`Select ${m.unit.race}`}
                    className="border-ink-300 text-primary-600 h-3.5 w-3.5 rounded"
                    checked={!!choices[m.unit.key]}
                    disabled={m.unit.resolved}
                    onChange={(e) => onToggle(m.unit, e.target.checked)}
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-1">
                  <span className="font-semibold">{m.unit.race}</span>
                  <span className="text-ink-500 ml-1">
                    {OFFICE_LABEL[m.unit.office]}
                  </span>
                </td>
                <td className="max-w-[22rem] px-2 py-1">
                  <a
                    href={m.unit.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-primary-700 line-clamp-1 hover:underline"
                  >
                    {m.unit.answerText
                      ? `${m.unit.answerText} · ${m.unit.question}`
                      : m.unit.question}
                  </a>
                </td>
                <td className="max-w-[10rem] truncate px-2 py-1 font-medium">
                  {m.option.label}
                  {m.unit.resolved && (
                    <span className="ml-1 text-teal-700">resolved</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                  {formatPercent(m.from)} → {formatPercent(m.to)}
                </td>
                <td className="px-2 py-1 text-right">
                  <Delta d={m.to - m.from} />
                </td>
                <td className="text-ink-500 px-2 py-1 text-right tabular-nums">
                  {m.trades}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ready && !moves.length && (
          <div className="text-ink-500 p-4 text-center text-xs">
            Nothing moved{' '}
            {minChange ? `${Math.round(minChange * 100)}+ pts ` : ''}
            in this window.
          </div>
        )}
      </div>
    </Col>
  )
}

// Senate and House control are binaries whose YES is Republicans winning.
const controlLabel = (unit: ResolveUnit, value: string, label: string) =>
  unit.kind === 'binary' ? (value === 'YES' ? 'R' : 'D') : label

function Delta(props: { d: number }) {
  const pts = Math.round(props.d * 1000) / 10
  if (!Number.isFinite(pts) || pts === 0)
    return <span className="text-ink-400 tabular-nums">0</span>
  return (
    <span
      className={clsx(
        'font-semibold tabular-nums',
        pts > 0 ? 'text-teal-700' : 'text-scarlet-600'
      )}
    >
      {pts > 0 ? '+' : '−'}
      {Math.abs(pts)}
    </span>
  )
}

const etTime = (ms: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(ms) + ' ET'

const REFRESH_MS = 15_000
// Up to this span, a window loads as full bets for 100 markets per call;
// longer ones as compact price points, one call per market.
const FULL_BETS_MAX_SPAN = 15 * MINUTE
const FULL_BETS_PAGE = 10_000
const POINTS_LIMIT = 50_000
const POINTS_CONCURRENCY = 12

export type ElectionTrades = ReturnType<typeof useElectionTrades>

const needsLoad = (wanted?: number, covered?: number) =>
  wanted !== undefined && (covered === undefined || covered > wanted)

// The map markets' trades, complete from `coveredSince` to `updatedAt`.
// ensureCovered(t) loads further back when a longer window needs it; a
// refresh every REFRESH_MS adds new trades.
export function useElectionTrades(ids: string[] | undefined) {
  const store = useRef<TradeStore>(new Map())
  const seen = useRef(new Set<string>())
  const covered = useRef<number>()
  const lastFetch = useRef<number>()
  const busy = useRef(false)
  const [coveredSince, setCoveredSince] = useState<number>()
  const [updatedAt, setUpdatedAt] = useState<number>()
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string>()

  const fetchFull = useCallback(
    async (afterTime: number, beforeTime?: number) => {
      if (!ids) return
      await Promise.all(
        chunk(ids, 100).map(async (c) => {
          let after = afterTime
          for (let page = 0; page < 20; page++) {
            const bets = await api(
              'bets',
              {
                contractId: c,
                afterTime: after,
                beforeTime,
                order: 'asc',
                limit: FULL_BETS_PAGE,
              },
              { cache: 'no-store' }
            )
            addTrades(store.current, seen.current, bets)
            if (bets.length < FULL_BETS_PAGE) break
            // Same-millisecond rows at the boundary are skipped as seen.
            after = bets[bets.length - 1].createdTime - 1
          }
        })
      )
    },
    [ids]
  )

  const fetchPoints = useCallback(
    async (afterTime: number, beforeTime?: number) => {
      if (!ids) return
      const queue = [...ids]
      await Promise.all(
        Array.from({ length: POINTS_CONCURRENCY }, async () => {
          for (let id = queue.shift(); id; id = queue.shift()) {
            const points = await api('bets', {
              contractId: id,
              afterTime,
              beforeTime,
              points: true,
              limit: POINTS_LIMIT,
            })
            addTrades(store.current, seen.current, points, id)
          }
        })
      )
    },
    [ids]
  )

  // The earliest moment any window has asked for. Loading runs until the
  // store covers it, one load at a time; a failed load retries after the
  // next refresh.
  const wanted = useRef<number>()

  const load = useCallback(async () => {
    if (!ids || busy.current) return
    busy.current = true
    try {
      while (needsLoad(wanted.current, covered.current)) {
        if (wanted.current === undefined) break
        const since = wanted.current
        const now = Date.now()
        // Fill only the gap: [since, what is already covered).
        const before = covered.current
        if (lastFetch.current === undefined) lastFetch.current = now
        if ((before ?? now) - since <= FULL_BETS_MAX_SPAN)
          await fetchFull(since, before)
        else await fetchPoints(since, before)
        covered.current = since
        setCoveredSince(since)
        setUpdatedAt(Date.now())
        setVersion((v) => v + 1)
        setError(undefined)
      }
    } catch (e) {
      setError(
        `Trades did not load, retrying: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
    } finally {
      busy.current = false
    }
  }, [ids, fetchFull, fetchPoints])

  const ensureCovered = useCallback(
    (since: number) => {
      wanted.current =
        wanted.current === undefined ? since : Math.min(wanted.current, since)
      void load()
    },
    [load]
  )

  useEffect(() => {
    if (!ids) return
    // Windows asked for before the ids arrived.
    void load()
    const timer = setInterval(async () => {
      if (busy.current) return
      if (
        lastFetch.current === undefined ||
        needsLoad(wanted.current, covered.current)
      ) {
        void load()
        return
      }
      busy.current = true
      const start = Date.now()
      try {
        // Overlap the last fetch: a trade can commit after its timestamp.
        await fetchFull(lastFetch.current - 10_000)
        lastFetch.current = start
        setUpdatedAt(Date.now())
        setVersion((v) => v + 1)
        setError(undefined)
      } catch (e) {
        setError(
          `Trades did not refresh: ${
            e instanceof Error ? e.message : String(e)
          }`
        )
      } finally {
        busy.current = false
      }
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [ids, fetchFull, load])

  return { store, coveredSince, updatedAt, version, error, ensureCovered }
}
