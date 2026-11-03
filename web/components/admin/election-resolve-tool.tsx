import clsx from 'clsx'
import { chunk, keyBy, uniq } from 'lodash'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Contract } from 'common/contract'
import { run } from 'common/supabase/utils'
import { formatPercent } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Select } from 'web/components/widgets/select'
import { api } from 'web/lib/api/api'
import {
  buildUnits,
  MapSource,
  mapSources,
  Office,
  OFFICE_LABEL,
  OFFICES,
  optionFor,
  ResolveUnit,
  Snapshot,
  snapshotOf,
  SortKey,
  sortUnits,
} from 'web/lib/politics/election-resolve-model'
import { db } from 'web/lib/supabase/db'
import { ElectionResolveConfirm, RunResult } from './election-resolve-confirm'
import { ElectionTweetDraft } from './election-tweet-draft'

const REFRESH_MS = 30_000
const HISTORY_MS = 2 * 60 * 60 * 1000

export function ElectionResolveTool() {
  const sources = useMemo(mapSources, [])
  const { contracts, loadedAt, error, refresh } = useMapMarkets(sources)
  const contractsBySlug = useMemo(() => keyBy(contracts, 'slug'), [contracts])
  const units = useMemo(
    () => buildUnits(sources, contractsBySlug, keyBy(contracts, 'id')),
    [sources, contracts, contractsBySlug]
  )

  // Every refresh's prices, for the tweet draft's "moves since".
  const history = useRef<Snapshot[]>([])
  useEffect(() => {
    if (!loadedAt || !units.length) return
    if (history.current.some((s) => s.t === loadedAt)) return
    history.current = [
      ...history.current.filter((s) => s.t > loadedAt - HISTORY_MS),
      snapshotOf(units, loadedAt),
    ]
  }, [loadedAt, units])

  const [office, setOffice] = useState<Office | 'all'>('all')
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open')
  const [sort, setSort] = useState<SortKey>('chance-desc')
  const [query, setQuery] = useState('')
  const [minChance, setMinChance] = useState(0)

  // unit key -> the outcome chosen for it, fixed when it was ticked, so a
  // price move after selection can never change what gets resolved.
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, RunResult>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sortUnits(
      units.filter(
        (u) =>
          (office === 'all' || u.office === office) &&
          (status === 'all' || (status === 'open') === !u.resolved) &&
          u.leader.prob * 100 >= minChance &&
          (!q ||
            `${u.race} ${u.question} ${u.answerText ?? ''}`
              .toLowerCase()
              .includes(q))
      ),
      sort
    )
  }, [units, office, status, sort, query, minChance])

  const selected = units.filter(
    (u) => !u.resolved && choices[u.key] !== undefined
  )
  const countByOffice = (o: Office) =>
    units.filter((u) => u.office === o && !u.resolved).length

  const toggle = (unit: ResolveUnit, on: boolean) =>
    setChoices((c) => {
      const next = { ...c }
      if (on) next[unit.key] = c[unit.key] ?? unit.leader.value
      else delete next[unit.key]
      return next
    })
  const choose = (unit: ResolveUnit, value: string) =>
    setChoices((c) => ({ ...c, [unit.key]: value }))
  const selectShown = () =>
    setChoices((c) => {
      const next = { ...c }
      for (const u of shown)
        if (!u.resolved) next[u.key] = c[u.key] ?? u.leader.value
      return next
    })

  const onFinished = (out: Record<string, RunResult>) => {
    setResults((r) => ({ ...r, ...out }))
    setChoices((c) => {
      const next = { ...c }
      for (const [key, r] of Object.entries(out))
        if (r.status === 'ok') delete next[key]
      return next
    })
    refresh()
  }

  if (!contracts.length && !error) return <LoadingIndicator />

  return (
    <Col className="gap-4">
      <ElectionTweetDraft
        units={units}
        contractsBySlug={contractsBySlug}
        history={history}
        loadedAt={loadedAt}
      />

      <Row className="text-ink-600 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          {units.filter((u) => !u.resolved).length} open ·{' '}
          {units.filter((u) => u.resolved).length} resolved, across{' '}
          {uniq(units.map((u) => u.contractId)).length} markets
        </span>
        <span>
          Prices refresh every 30s
          {loadedAt
            ? `, last at ${new Date(loadedAt).toLocaleTimeString()}`
            : ''}
        </span>
        <button className="text-primary-600 underline" onClick={refresh}>
          Refresh now
        </button>
        {error && <span className="text-scarlet-600">{error}</span>}
      </Row>

      <Row className="flex-wrap gap-2">
        {(['all', ...OFFICES] as const).map((o) => (
          <button
            key={o}
            onClick={() => setOffice(o)}
            className={clsx(
              'rounded-full border px-3 py-1 text-sm font-medium',
              office === o
                ? 'bg-ink-900 border-ink-900 text-canvas-0'
                : 'border-ink-300 text-ink-700 bg-canvas-0'
            )}
          >
            {o === 'all' ? 'All' : OFFICE_LABEL[o]}
            {o !== 'all' && (
              <span className="ml-1 opacity-70">{countByOffice(o)}</span>
            )}
          </button>
        ))}
      </Row>

      <Row className="flex-wrap items-end gap-3">
        <Input
          className="w-64"
          placeholder="Search race, question or answer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label
          htmlFor="er-status"
          className="text-ink-600 flex flex-col text-xs"
        >
          Status
          <Select
            id="er-status"
            className="!h-10"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </Select>
        </label>
        <label htmlFor="er-sort" className="text-ink-600 flex flex-col text-xs">
          Sort
          <Select
            id="er-sort"
            className="!h-10"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="chance-desc">Leader %chance, high first</option>
            <option value="chance-asc">Leader %chance, low first</option>
            <option value="race">Race</option>
          </Select>
        </label>
        <label
          htmlFor="er-min-chance"
          className="text-ink-600 flex flex-col text-xs"
        >
          Leader at least
          <Input
            id="er-min-chance"
            className="!h-10 w-24"
            type="number"
            min={0}
            max={100}
            value={minChance}
            onChange={(e) => {
              const v = Number(e.target.value)
              setMinChance(
                Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0
              )
            }}
          />
        </label>
      </Row>

      <div className="border-ink-200 bg-canvas-0 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-ink-500 bg-canvas-50 text-left text-xs uppercase">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2">Race</th>
              <th className="px-3 py-2">Market</th>
              <th className="px-3 py-2">Leader</th>
              <th className="px-3 py-2">Resolve to</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <UnitRow
                key={u.key}
                unit={u}
                choice={choices[u.key]}
                result={results[u.key]}
                onToggle={(on) => toggle(u, on)}
                onChoose={(v) => choose(u, v)}
              />
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <div className="text-ink-500 p-8 text-center">
            Nothing matches these filters.
          </div>
        )}
      </div>

      <Row className="border-ink-200 bg-canvas-0 sticky bottom-0 z-10 flex-wrap items-center gap-3 border-t px-2 py-3">
        <span className="text-sm font-semibold">
          {selected.length} selected
        </span>
        <Button size="sm" color="gray-outline" onClick={selectShown}>
          Select all shown
        </Button>
        <Button size="sm" color="gray-outline" onClick={() => setChoices({})}>
          Clear
        </Button>
        <Button
          size="sm"
          color="red"
          disabled={!selected.length}
          onClick={() => setConfirmOpen(true)}
          className="ml-auto"
        >
          Review and resolve {selected.length}
        </Button>
      </Row>

      <ElectionResolveConfirm
        open={confirmOpen}
        setOpen={setConfirmOpen}
        units={selected}
        choices={choices}
        onFinished={onFinished}
      />
    </Col>
  )
}

function UnitRow(props: {
  unit: ResolveUnit
  choice?: string
  result?: RunResult
  onToggle: (on: boolean) => void
  onChoose: (value: string) => void
}) {
  const { unit, choice, result, onToggle, onChoose } = props
  const picked = choice !== undefined
  const pickedOption = picked ? optionFor(unit, choice) : undefined
  const againstLeader = picked && choice !== unit.leader.value
  return (
    <tr
      className={clsx(
        'border-ink-100 border-t align-top',
        picked && 'bg-primary-50'
      )}
    >
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label={`Select ${unit.race}`}
          className="border-ink-300 text-primary-600 h-4 w-4 rounded"
          checked={picked}
          disabled={unit.resolved}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </td>
      <td className="min-w-[7rem] max-w-[11rem] px-3 py-2">
        <div className="font-semibold">{unit.race}</div>
        <div className="text-ink-500 text-xs">{OFFICE_LABEL[unit.office]}</div>
      </td>
      <td className="min-w-[16rem] px-3 py-2">
        <a
          href={unit.url}
          target="_blank"
          rel="noreferrer"
          className="hover:text-primary-700 font-medium hover:underline"
        >
          {unit.question}
        </a>
        {unit.answerText && (
          <div className="text-ink-600 text-xs">Answer: {unit.answerText}</div>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <div className="font-semibold tabular-nums">
          {formatPercent(unit.leader.prob)}
        </div>
        <div className="text-ink-600 max-w-[12rem] truncate text-xs">
          {unit.leader.label}
        </div>
      </td>
      <td className="px-3 py-2">
        {unit.resolved ? (
          <span className="text-ink-500">—</span>
        ) : (
          <Col className="gap-1">
            <Select
              className="!h-9 max-w-[14rem] !pl-2 !pr-8"
              aria-label={`Outcome for ${unit.race}`}
              value={choice ?? unit.leader.value}
              onChange={(e) => onChoose(e.target.value)}
            >
              {unit.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({formatPercent(o.prob)})
                </option>
              ))}
            </Select>
            {againstLeader && pickedOption && (
              <span className="text-xs text-amber-700">
                Against the market ({formatPercent(pickedOption.prob)})
              </span>
            )}
          </Col>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {unit.resolved ? (
          <span className="text-teal-700">Resolved {resolvedText(unit)}</span>
        ) : result?.status === 'error' ? (
          <span className="text-scarlet-600">{result.message}</span>
        ) : (
          <span className="text-ink-500">Open</span>
        )}
      </td>
    </tr>
  )
}

const resolvedText = (unit: ResolveUnit) => {
  const r = unit.resolutionLabel
  if (!r) return ''
  return unit.kind === 'choose-one' ? r : r === 'CANCEL' ? 'N/A' : r
}

// The map's markets with fresh prices: slugs resolved to ids once, then
// every market (with answers) re-read every REFRESH_MS.
function useMapMarkets(sources: MapSource[]) {
  const [ids, setIds] = useState<string[]>()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loadedAt, setLoadedAt] = useState<number>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const slugs = uniq(
      sources.flatMap((s) => ('slug' in s.ref ? [s.ref.slug] : []))
    )
    const directIds = sources.flatMap((s) => ('id' in s.ref ? [s.ref.id] : []))
    Promise.all(
      chunk(slugs, 100).map((c) =>
        run(db.from('contracts').select('id, slug').in('slug', c))
      )
    )
      .then((results) =>
        setIds(
          uniq([
            ...results.flatMap((r) => r.data.map((row) => row.id)),
            ...directIds,
          ])
        )
      )
      .catch((e) =>
        setError(
          `Could not look up the map's markets: ${
            e instanceof Error ? e.message : String(e)
          }`
        )
      )
  }, [sources])

  const inFlight = useRef(false)
  const refresh = useCallback(async () => {
    if (!ids || inFlight.current) return
    inFlight.current = true
    try {
      const pages = await Promise.all(
        chunk(ids, 100).map((c) => api('markets-by-ids', { ids: c }))
      )
      setContracts(pages.flat())
      setLoadedAt(Date.now())
      setError(undefined)
    } catch (e) {
      setError(
        `Refresh failed, showing older prices: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
    } finally {
      inFlight.current = false
    }
  }, [ids])

  useEffect(() => {
    if (!ids) return
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(timer)
  }, [ids, refresh])

  return { contracts, loadedAt, error, refresh }
}
