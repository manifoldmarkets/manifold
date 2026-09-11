import clsx from 'clsx'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ENV } from 'common/envs/constants'
import {
  getPerpConfig,
  getEffectiveApiFee,
  MnxDashboard,
  MnxDashboardMarket,
} from 'common/perps/management'
import {
  MNX_DEFAULT_FEES,
  MNX_INSTRUMENTS,
  getMnxInstrument,
} from 'common/perps/mnx'
import { getPerpOracleFreshness } from 'common/perps/oracle'
import { randomString } from 'common/util/random'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { api } from 'web/lib/api/api'
import {
  buildMnxRulePatch,
  MNX_RULE_FIELDS,
  MnxBatch,
  MnxBatchItem,
  MnxRuleForm,
  ruleValue,
  runMnxBatch,
} from 'common/perps/mnx-management'

const number = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
const mana = (value: number) => `M$${number(value)}`
const panel = 'border-ink-200 bg-canvas-0 rounded-xl border'
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export function MnxDashboardView({
  data,
  refresh,
  refreshing,
}: {
  data: MnxDashboard
  refresh: () => Promise<void>
  refreshing: boolean
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<'liquidity' | 'rules'>('liquidity')
  const [side, setSide] = useState<'both' | 'long' | 'short'>('both')
  const [amount, setAmount] = useState('')
  const [rules, setRules] = useState<MnxRuleForm>({})
  const [preview, setPreview] = useState<MnxBatch>()
  const [batch, setBatch] = useState<MnxBatch>()
  const [running, setRunning] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const [acknowledge, setAcknowledge] = useState(false)
  const active = useRef(true)
  const busy = useRef(false)
  const editor = useRef<HTMLDivElement>(null)
  const storageKey = `mnx-management-v1:${ENV}:${data.payer.id}`
  useEffect(() => {
    active.current = true
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const previous = JSON.parse(stored) as MnxBatch
        if (
          previous.version !== 1 ||
          previous.actorId !== data.payer.id ||
          !Array.isArray(previous.items)
        )
          throw new Error(
            'The saved MNX batch could not be read. Keep it for recovery before starting another batch.'
          )
        setBatch(previous)
      }
      setReady(true)
    } catch (error) {
      setError(errorMessage(error))
    }
    return () => {
      active.current = false
    }
  }, [storageKey, data.payer.id])

  const live = data.markets.filter(({ contract }) => !contract.isResolved)
  const targets = live.filter(({ contract }) => selected.includes(contract.id))
  const missing = MNX_INSTRUMENTS.filter(
    (i) => !live.some((m) => m.contract.oracleFeedId === i.feedId)
  )
  const sum = (fn: (m: MnxDashboardMarket) => number) =>
    live.reduce((total, m) => total + fn(m), 0)
  const totalCost = Number(amount) * (side === 'both' ? 2 : 1) * targets.length
  const locked = !!batch || !!preview || running
  const one = targets.length === 1 ? targets[0].contract : undefined

  const saveBatch = (next: MnxBatch) => {
    // If storage fails, runMnxBatch stops before sending another paid request.
    localStorage.setItem(storageKey, JSON.stringify(next))
    if (active.current)
      setBatch({ ...next, items: next.items.map((i) => ({ ...i })) })
  }
  const execute = async (next: MnxBatch) => {
    if (busy.current || next.actorId !== data.payer.id) return
    busy.current = true
    setRunning(true)
    setError(undefined)
    try {
      saveBatch(next)
      setPreview(undefined)
      await runMnxBatch(
        next,
        saveBatch,
        async (item) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 30_000)
          try {
            return item.kind === 'liquidity'
              ? await api('add-perp-subsidy', item.params, {
                  signal: controller.signal,
                })
              : await api('update-perp-config', item.params, {
                  signal: controller.signal,
                })
          } finally {
            clearTimeout(timeout)
          }
        },
        () => active.current
      )
    } catch (error) {
      if (active.current) setError(errorMessage(error))
    } finally {
      busy.current = false
      if (active.current) {
        setRunning(false)
        await refresh()
      }
    }
  }
  const review = () => {
    setError(undefined)
    try {
      if (!targets.length) throw new Error('Select at least one live market.')
      if (
        mode === 'liquidity' &&
        (!Number.isFinite(Number(amount)) ||
          Number(amount) <= 0 ||
          Number(amount) > 1_000_000)
      )
        throw new Error(
          'Enter between 0 and 1,000,000 mana per side, greater than zero.'
        )
      if (mode === 'liquidity' && totalCost > data.payer.balance)
        throw new Error(
          `@${data.payer.username} needs ${mana(totalCost)} to fund this batch.`
        )
      const items: MnxBatchItem[] = targets.map(
        ({ contract, minOraclePriceAgeMs }) => {
          const base = {
            title:
              getMnxInstrument(contract.oracleFeedId)?.symbol ??
              contract.question,
            status: 'pending' as const,
          }
          if (mode === 'liquidity')
            return {
              ...base,
              kind: 'liquidity',
              params: {
                contractId: contract.id,
                side,
                amount: Number(amount),
                idempotencyKey: randomString(),
                expectedManagerId: data.payer.id,
              },
            }
          const patch = buildMnxRulePatch(rules, contract)
          if (
            patch.maxOraclePriceAgeMs !== undefined &&
            patch.maxOraclePriceAgeMs < minOraclePriceAgeMs
          )
            throw new Error(
              `${base.title} needs a mark age of at least ${number(
                minOraclePriceAgeMs / 1000
              )} seconds.`
            )
          return {
            ...base,
            kind: 'rules',
            params: {
              contractId: contract.id,
              ...patch,
              expectedConfig: getPerpConfig(contract),
              expectedManagerId: data.payer.id,
            },
          }
        }
      )
      setPreview({
        version: 1,
        actorId: data.payer.id,
        createdAt: Date.now(),
        items,
      })
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  const finish = () => {
    try {
      localStorage.removeItem(storageKey)
      setBatch(undefined)
      setAcknowledge(false)
      setSelected([])
      setError(undefined)
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
    )

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 p-4 pb-12 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary-600 text-xs font-semibold uppercase tracking-widest">
            Partner console · {ENV}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            MNX markets
          </h1>
          <p className="text-ink-500 mt-2 text-sm">
            Backing, activity, and trading rules in one place.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            color="gray-outline"
            onClick={refresh}
            disabled={refreshing || running}
          >
            {refreshing ? 'Refreshing…' : 'Refresh stats'}
          </Button>
          <span className="text-ink-500 text-xs">
            Snapshot {new Date(data.asOf).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="MNX available balance"
          value={data.account ? mana(data.account.balance) : 'Not configured'}
          note={`${live.length} live · ${missing.length} feeds without an MNX market`}
        />
        <Stat
          label="Total backing"
          value={mana(sum((m) => m.contract.poolLong + m.contract.poolShort))}
          note="Long and short pools combined"
        />
        <Stat
          label="Open interest"
          value={mana(sum((m) => m.openInterestLong + m.openInterestShort))}
          note="Leveraged notional across live markets"
        />
        <Stat
          label="24h trading activity"
          value={mana(sum((m) => m.volume24Hours))}
          note={`${mana(sum((m) => m.fees24Hours))} fees added to backing`}
        />
      </div>

      <section className={panel} aria-label="MNX markets">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="font-semibold">Your markets</h2>
            <p className="text-ink-500 text-xs">
              Volume is margin opened and closed; fees are charged on opening
              notional.
            </p>
          </div>
          <Button
            size="xs"
            color="gray-outline"
            disabled={locked || !live.length}
            onClick={() =>
              setSelected(
                targets.length === live.length
                  ? []
                  : live.map((m) => m.contract.id)
              )
            }
          >
            {targets.length === live.length && live.length
              ? 'Clear selection'
              : 'Select all live'}
          </Button>
        </div>
        {data.markets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-ink-500 bg-canvas-50 border-ink-200 border-y text-xs">
                <tr>
                  <th className="p-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-3 pr-4">Market / oracle</th>
                  <th className="py-3 pr-4">Backing · L / S</th>
                  <th className="py-3 pr-4">Open interest</th>
                  <th className="py-3 pr-4">24h volume / fees</th>
                  <th className="py-3 pr-4">Fees · web / API</th>
                  <th className="p-3">
                    <span className="sr-only">Manage</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y">
                {data.markets.map((market) => {
                  const c = market.contract
                  const config = getPerpConfig(c)
                  const health = getPerpOracleFreshness(c, data.asOf)
                  const halted = c.solvencyHaltTime != null
                  const status = c.isResolved
                    ? 'Resolved'
                    : halted
                    ? 'Trading halted'
                    : health.status === 'fresh'
                    ? 'Oracle healthy'
                    : 'Oracle stale'
                  return (
                    <tr
                      key={c.id}
                      className={clsx(
                        selected.includes(c.id) && 'bg-primary-50/50'
                      )}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${
                            getMnxInstrument(c.oracleFeedId)?.symbol
                          }`}
                          checked={selected.includes(c.id)}
                          disabled={locked || c.isResolved}
                          onChange={() => toggle(c.id)}
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <Link
                          href={`/${c.creatorUsername}/${c.slug}`}
                          className="text-primary-700 font-semibold hover:underline"
                        >
                          {getMnxInstrument(c.oracleFeedId)?.symbol}
                        </Link>
                        <div className="text-ink-500 whitespace-nowrap text-xs">
                          ${number(c.oraclePrice)}
                          {getMnxInstrument(c.oracleFeedId)?.category ===
                          'valuation'
                            ? 'B'
                            : ''}{' '}
                          · {c.visibility}
                        </div>
                        <div
                          title={c.solvencyHaltReason ?? health.reason}
                          className={clsx(
                            'mt-1 whitespace-nowrap text-xs',
                            c.isResolved
                              ? 'text-ink-500'
                              : halted || health.status !== 'fresh'
                              ? 'text-amber-700'
                              : 'text-teal-600'
                          )}
                        >
                          {status}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-4 pr-4 tabular-nums">
                        <div>{mana(c.poolLong)}</div>
                        <div className="text-ink-500">{mana(c.poolShort)}</div>
                      </td>
                      <td className="whitespace-nowrap py-4 pr-4 tabular-nums">
                        <div>
                          {mana(
                            market.openInterestLong + market.openInterestShort
                          )}
                        </div>
                        <div className="text-ink-500 text-xs">
                          {market.activeTraders} active traders
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-4 pr-4 tabular-nums">
                        <div>{mana(market.volume24Hours)}</div>
                        <div className="text-ink-500 text-xs">
                          {mana(market.fees24Hours)} fees
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-4 pr-4 tabular-nums">
                        <div>
                          {config.takerFeeBps} / {getEffectiveApiFee(c)} bps
                        </div>
                        <div className="text-ink-500 text-xs">
                          Impact {config.takerFeeImpact} · {c.maxLeverage}× cap
                        </div>
                      </td>
                      <td className="p-3">
                        <Button
                          size="xs"
                          color="gray-outline"
                          disabled={locked || c.isResolved}
                          onClick={() => {
                            setSelected([c.id])
                            setMode('rules')
                            setRules({})
                            editor.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            })
                          }}
                        >
                          Manage
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-ink-500 border-ink-100 border-t px-6 py-10 text-center">
            No MNX-owned markets yet. Markets created by the MNX launch script
            will appear here.
          </div>
        )}
        {missing.length > 0 && (
          <details className="border-ink-100 border-t p-4 text-sm">
            <summary className="text-ink-500 cursor-pointer">
              {missing.length} feeds without a live MNX-owned market
            </summary>
            <p className="mt-2">{missing.map((i) => i.symbol).join(' · ')}</p>
            <p className="text-ink-500 mt-2 text-xs">
              Creation still uses the launch script and its funding checks.
              Markets owned by other accounts are excluded from this dashboard.
            </p>
          </details>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="bg-scarlet-50 text-scarlet-700 rounded-lg p-4 text-sm"
        >
          {error}
        </div>
      )}

      {batch ? (
        <section className={`${panel} p-5`} aria-live="polite">
          <h2 className="font-semibold">
            {running ? 'Applying batch…' : 'Batch results'} ·{' '}
            {batch.items.filter((i) => i.status === 'done').length}/
            {batch.items.length} complete
          </h2>
          <p className="text-ink-500 mt-1 text-sm">
            Completed markets are skipped on retry. Remaining liquidity requests
            keep their original request IDs.
          </p>
          <ul className="my-4 space-y-2 text-sm">
            {batch.items.map((item) => (
              <li key={item.params.contractId}>
                <b>{item.title}</b> ·{' '}
                {item.status === 'done'
                  ? 'Done'
                  : item.status === 'error'
                  ? 'Needs attention'
                  : 'Pending'}
                {item.error && (
                  <p className="text-scarlet-600 break-words">{item.error}</p>
                )}
              </li>
            ))}
          </ul>
          {!running && batch.items.some((i) => i.status !== 'done') && (
            <>
              <Button onClick={() => execute(batch)}>Retry remaining</Button>
              <label className="text-ink-500 my-4 flex items-start gap-2 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                />
                I have checked any uncertain results and want to end this batch
                without retrying. A new liquidity batch would make new payments.
              </label>
            </>
          )}
          <Button
            color="gray-outline"
            disabled={
              running ||
              (batch.items.some((i) => i.status !== 'done') && !acknowledge)
            }
            onClick={finish}
          >
            Finish batch
          </Button>
        </section>
      ) : preview ? (
        <section className={`${panel} p-5`}>
          <h2 className="text-lg font-semibold">
            Review{' '}
            {preview.items.length === 1
              ? 'market change'
              : `${preview.items.length} market changes`}
          </h2>
          <p className="text-ink-500 mt-1 text-sm">
            Applying as @{data.payer.username}. Markets are processed one at a
            time; the batch stops if one fails.
          </p>
          {preview.items[0]?.kind === 'liquidity' && (
            <div className="bg-primary-50 my-4 rounded-lg p-4">
              <p className="text-primary-800 text-xl font-semibold">
                {mana(
                  preview.items.reduce(
                    (total, item) =>
                      total +
                      (item.kind === 'liquidity'
                        ? item.params.amount *
                          (item.params.side === 'both' ? 2 : 1)
                        : 0),
                    0
                  )
                )}{' '}
                from @{data.payer.username}
              </p>
              <p className="text-ink-600 mt-1 text-sm">
                This adds backing, with no withdrawable LP shares. Remaining
                backing goes to the market creator at settlement.
              </p>
            </div>
          )}
          <ul className="divide-ink-100 my-4 divide-y">
            {preview.items.map((item) => {
              const c = data.markets.find(
                (m) => m.contract.id === item.params.contractId
              )!.contract
              return (
                <li key={c.id} className="py-3 text-sm">
                  <b>{item.title}</b>
                  {item.kind === 'liquidity' ? (
                    <p className="text-ink-600">
                      {mana(item.params.amount)} to{' '}
                      {item.params.side === 'both'
                        ? 'each side'
                        : `the ${item.params.side} side`}
                    </p>
                  ) : (
                    <>
                      <div className="text-ink-600 mt-1 flex flex-wrap gap-x-6 gap-y-1">
                        {MNX_RULE_FIELDS.filter(({ key }) =>
                          rules[key]?.trim()
                        ).map(({ key, label, unit }) => (
                          <span key={key}>
                            {label}:{' '}
                            {number(
                              ruleValue({ ...c, ...getPerpConfig(c) }, key)
                            )}{' '}
                            →{' '}
                            <b>
                              {number(ruleValue({ ...c, ...item.params }, key))}
                              {unit}
                            </b>
                          </span>
                        ))}
                      </div>
                      <p className="text-ink-500 mt-1">
                        Effective API base:{' '}
                        {getEffectiveApiFee({ ...c, ...item.params })} bps
                      </p>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex gap-3">
            <Button onClick={() => execute(preview)} disabled={running}>
              Apply {preview.items.length === 1 ? 'change' : 'batch'}
            </Button>
            <Button color="gray-outline" onClick={() => setPreview(undefined)}>
              Back to editing
            </Button>
          </div>
        </section>
      ) : (
        <section ref={editor} className={`${panel} scroll-mt-4 p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                Manage{' '}
                {targets.length === 1
                  ? getMnxInstrument(one?.oracleFeedId)?.symbol
                  : `${targets.length} selected markets`}
              </h2>
              <p className="text-ink-500 mt-1 text-sm">
                Select one market for individual changes, or several for a bulk
                update.
              </p>
            </div>
            <div className="bg-canvas-50 flex gap-1 rounded-lg p-1">
              {(['liquidity', 'rules'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMode(tab)}
                  className={clsx(
                    'rounded-md px-3 py-2 text-sm',
                    mode === tab
                      ? 'bg-canvas-0 text-primary-700 shadow-sm'
                      : 'text-ink-500'
                  )}
                >
                  {tab === 'liquidity' ? 'Add liquidity' : 'Trading rules'}
                </button>
              ))}
            </div>
          </div>
          {mode === 'liquidity' ? (
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium">
                  Pool side
                  <select
                    value={side}
                    onChange={(e) => setSide(e.target.value as typeof side)}
                    className="border-ink-300 bg-canvas-0 mt-2 w-full rounded-md border p-2.5"
                  >
                    <option value="both">Both sides equally</option>
                    <option value="long">Long only</option>
                    <option value="short">Short only</option>
                  </select>
                </label>
                <label
                  htmlFor="mnx-liquidity-amount"
                  className="text-sm font-medium"
                >
                  Mana per market, per selected side
                  <Input
                    className="mt-2 w-full"
                    type="number"
                    min={0}
                    max={1_000_000}
                    id="mnx-liquidity-amount"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 1,000"
                  />
                </label>
              </div>
              <div className="bg-canvas-50 rounded-lg p-4">
                <p className="text-ink-500 text-xs uppercase tracking-wide">
                  Total contribution
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {Number.isFinite(totalCost) && totalCost >= 0
                    ? mana(totalCost)
                    : '—'}
                </p>
                <p className="text-ink-600 mt-2 text-sm">
                  {targets.length} markets ×{' '}
                  {side === 'both' ? '2 sides' : '1 side'} ×{' '}
                  {Number.isFinite(Number(amount)) ? mana(Number(amount)) : '—'}
                </p>
                <p className="text-ink-500 mt-3 text-sm">
                  Paid by <b>@{data.payer.username}</b> ·{' '}
                  {mana(data.payer.balance)} available
                </p>
                <p className="text-ink-500 mt-2 text-xs">
                  Backing is committed to the markets. This does not buy LP
                  shares or a right to withdraw.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="bg-canvas-50 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg p-3">
                <p className="text-ink-600 text-sm">
                  MNX starting fees: 10 bps web · 20 bps API · impact 10
                </p>
                <Button
                  size="xs"
                  color="gray-outline"
                  onClick={() =>
                    setRules((r) => ({
                      ...r,
                      ...Object.fromEntries(
                        Object.entries(MNX_DEFAULT_FEES).map(([k, v]) => [
                          k,
                          String(v),
                        ])
                      ),
                    }))
                  }
                >
                  Use MNX fee preset
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {MNX_RULE_FIELDS.map(({ key, label, unit, ...bounds }) => (
                  <label
                    key={key}
                    htmlFor={`mnx-rule-${key}`}
                    className="text-sm font-medium"
                  >
                    {label}
                    {unit ? ` (${unit})` : ''}
                    <Input
                      className="mt-2 w-full"
                      type="number"
                      {...bounds}
                      id={`mnx-rule-${key}`}
                      step="any"
                      value={rules[key] ?? ''}
                      onChange={(e) =>
                        setRules({ ...rules, [key]: e.target.value })
                      }
                      placeholder={
                        one
                          ? `Current: ${number(
                              ruleValue({ ...one, ...getPerpConfig(one) }, key)
                            )}`
                          : 'Leave unchanged'
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="text-ink-500 mt-4 space-y-2 text-xs">
                <p>
                  Blank fields stay unchanged. API base is the higher of the web
                  and API rates. 20 bps = 0.20% of opening notional, plus the
                  size-impact fee. Closing is free.
                </p>
                <p>
                  The annualized funding cap is converted using each market’s
                  funding period; it is a maximum, not a promised yield. Lower
                  leverage caps apply to new opens and adds. Increasing MNX
                  leverage requires current provider support.
                </p>
                <p>
                  Maximum mark age also gates closes. The strictest minimum
                  among selected feeds is{' '}
                  {number(
                    Math.max(0, ...targets.map((m) => m.minOraclePriceAgeMs)) /
                      1000
                  )}{' '}
                  seconds.
                </p>
              </div>
            </div>
          )}
          <div className="border-ink-100 mt-5 border-t pt-4">
            <Button
              onClick={review}
              disabled={!ready || !targets.length || refreshing}
            >
              Review {mode === 'liquidity' ? 'contribution' : 'rule changes'}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div className={`${panel} p-4`}>
      <p className="text-ink-500 text-xs">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-ink-500 mt-2 text-xs">{note}</p>
    </div>
  )
}
