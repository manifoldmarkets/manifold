import clsx from 'clsx'
import { countBy, groupBy, keyBy, sortBy } from 'lodash'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { contractPath, PerpContract } from 'common/contract'
import { ENV, isAdminId } from 'common/envs/constants'
import { getMnxCreatorId } from 'common/perps/creator-accounts'
import { inferPriceDecimals } from 'common/perps/format'
import {
  getPerpConfig,
  getEffectiveApiFee,
  MnxDashboard,
  PerpDashboardMarket,
  PerpsDashboard,
} from 'common/perps/management'
import {
  MNX_DEFAULT_FEES,
  MNX_INSTRUMENTS,
  getMnxInstrument,
} from 'common/perps/mnx'
import { getPerpOracleFreshness } from 'common/perps/oracle'
import { formatOraclePrice } from 'common/perps/oracle-display'
import { getPerpTicker } from 'common/perps/ticker'
import { randomString } from 'common/util/random'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { api } from 'web/lib/api/api'
import { ModActionTag } from 'web/components/moderation/mod-action'
import {
  buildMnxRulePatch,
  isMnxBatchInProgress,
  MNX_REQUEST_TIMEOUT_MS,
  MNX_RULE_FIELDS,
  MnxBatch,
  MnxBatchItem,
  MnxRuleForm,
  mnxBatchKeyPrefix,
  readMnxBatches,
  removeMnxBatch,
  ruleValue,
  runMnxBatch,
  saveMnxBatch,
} from 'common/perps/mnx-management'

const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const number = (value: number) => formatter.format(value)
const mana = (value: number) => `M$${number(value)}`
const panel = 'border-ink-200 bg-canvas-0 rounded-xl border'
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

// 'mnx' is the partner console: MNX's own markets, paid from the MNX account.
// 'all' is the admin console: every perp, paid from each market's creator.
export type PerpConsoleScope = 'mnx' | 'all'

const SORTS = {
  creator: 'Creator',
  newest: 'Newest',
  backing: 'Backing',
  interest: 'Open interest',
  volume: '24h volume',
} as const
type Sort = keyof typeof SORTS

// Stable, so within a creator markets keep their creation order.
const sortKey =
  (sort: Sort, creatorName: (id: string) => string) =>
  ({ contract: c, ...m }: PerpDashboardMarket) =>
    sort === 'creator'
      ? creatorName(c.creatorId).toLowerCase()
      : sort === 'newest'
      ? -c.createdTime
      : sort === 'backing'
      ? -(c.poolLong + c.poolShort)
      : sort === 'interest'
      ? -(m.openInterestLong + m.openInterestShort)
      : -m.volume24Hours

const perpLabel = (c: PerpContract) =>
  getMnxInstrument(c.oracleFeedId)?.symbol ?? getPerpTicker(c)

const liquidityCost = (items: MnxBatchItem[]) =>
  items.reduce(
    (total, item) =>
      total +
      (item.kind === 'liquidity'
        ? item.params.amount * (item.params.side === 'both' ? 2 : 1)
        : 0),
    0
  )

// The MNX console is the same console over MNX's markets, with the MNX
// account as the only creator.
export const mnxConsoleData = (data: MnxDashboard): PerpsDashboard => ({
  asOf: data.asOf,
  payer: data.payer,
  creators: data.account
    ? [{ ...data.account, name: data.account.username, canFund: true }]
    : [],
  markets: data.markets,
})

export function PerpManagementConsole({
  scope,
  data,
  refresh,
  refreshing,
}: {
  scope: PerpConsoleScope
  data: PerpsDashboard
  refresh: () => Promise<void>
  refreshing: boolean
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [creatorFilter, setCreatorFilter] = usePersistentInMemoryState<
    string | null
  >(null, 'perp-console-creator')
  const [sort, setSort] = usePersistentInMemoryState<Sort>(
    'creator',
    'perp-console-sort'
  )
  const [mode, setMode] = useState<'liquidity' | 'rules' | 'visibility'>(
    'liquidity'
  )
  const [visibility, setVisibility] = useState<'unlisted' | 'public'>(
    'unlisted'
  )
  const [side, setSide] = useState<'both' | 'long' | 'short'>('both')
  const [amount, setAmount] = useState('')
  const [rules, setRules] = useState<MnxRuleForm>({})
  const [preview, setPreview] = useState<MnxBatch>()
  // Every unfinished batch this account saved, in this or another tab.
  const [batches, setBatches] = useState<MnxBatch[]>([])
  const [runningId, setRunningId] = useState<string>()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const [now, setNow] = useState(() => Date.now())
  const active = useRef(true)
  const busy = useRef(false)
  const editor = useRef<HTMLDivElement>(null)
  const prefix = mnxBatchKeyPrefix(ENV, data.payer.id)
  useEffect(() => {
    active.current = true
    const load = () => {
      try {
        setBatches(readMnxBatches(localStorage, ENV, data.payer.id))
        setNow(Date.now())
        setReady(true)
      } catch (error) {
        setReady(false)
        setError(errorMessage(error))
      }
    }
    load()
    // Another tab saved, retried, or finished one of this account's batches.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(prefix)) load()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      active.current = false
      window.removeEventListener('storage', onStorage)
    }
  }, [prefix, data.payer.id])
  // A batch another tab is applying unlocks here once its marker goes stale.
  const watching = batches.some(
    (b) => b.id !== runningId && isMnxBatchInProgress(b, now)
  )
  useEffect(() => {
    if (!watching) return
    const timer = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(timer)
  }, [watching])

  const creatorById = keyBy(data.creators, 'id')
  const creatorName = (id: string) =>
    creatorById[id] ? `@${creatorById[id].username}` : id
  // Read off the markets, so a new creator gets a filter without code changes.
  const marketCounts = countBy(data.markets, (m) => m.contract.creatorId)
  const creatorIds = sortBy(Object.keys(marketCounts), (id) =>
    creatorName(id).toLowerCase()
  )
  const filter =
    scope === 'all' && creatorFilter && creatorIds.includes(creatorFilter)
      ? creatorFilter
      : null
  const shown = sortBy(
    filter
      ? data.markets.filter((m) => m.contract.creatorId === filter)
      : data.markets,
    sortKey(scope === 'all' ? sort : 'creator', creatorName)
  )
  const live = shown.filter(({ contract }) => !contract.isResolved)
  const targets = live.filter(({ contract }) => selected.includes(contract.id))
  const missing = MNX_INSTRUMENTS.filter(
    (i) => !live.some((m) => m.contract.oracleFeedId === i.feedId)
  )
  const sum = (fn: (m: PerpDashboardMarket) => number) =>
    live.reduce((total, m) => total + fn(m), 0)
  const perMarketCost = Number(amount) * (side === 'both' ? 2 : 1)
  const totalCost = perMarketCost * targets.length
  // Backing is paid by each market's creator, which receives what remains at
  // settlement. The MNX console has one creator, the MNX account.
  const funders = Object.entries(
    groupBy(targets, (m) => m.contract.creatorId)
  ).map(([id, markets]) => ({
    id,
    account: creatorById[id] as (typeof data.creators)[number] | undefined,
    cost: perMarketCost * markets.length,
  }))
  const mnxAccount = data.creators.find((c) => c.id === getMnxCreatorId(ENV))
  // MNX's fee preset and leverage note apply only to MNX feeds.
  const mnxTargets =
    scope === 'mnx' ||
    (targets.length > 0 &&
      targets.every(({ contract }) => getMnxInstrument(contract.oracleFeedId)))
  const locked = batches.length > 0 || !!preview || !!runningId
  const one = targets.length === 1 ? targets[0].contract : undefined

  const saveBatch = (next: MnxBatch) => {
    // If storage fails, runMnxBatch stops before sending another paid request.
    saveMnxBatch(localStorage, ENV, next)
    if (active.current)
      setBatches((prev) =>
        prev.some((b) => b.id === next.id)
          ? prev.map((b) => (b.id === next.id ? next : b))
          : [...prev, next]
      )
  }
  const send = async (item: MnxBatchItem) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MNX_REQUEST_TIMEOUT_MS)
    try {
      const options = { signal: controller.signal }
      switch (item.kind) {
        case 'liquidity':
          return await api('add-perp-subsidy', item.params, options)
        case 'rules':
          return await api('update-perp-config', item.params, options)
        case 'visibility':
          return await api('market/:contractId/update', item.params, options)
        default:
          throw new Error('Unknown saved batch action. Reload before retrying.')
      }
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error(
          `No response after ${
            MNX_REQUEST_TIMEOUT_MS / 1000
          } seconds. The request may still have gone through; Retry remaining uses the same saved request.`
        )
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  const execute = async (next: MnxBatch) => {
    if (busy.current || next.actorId !== data.payer.id) return
    if (isMnxBatchInProgress(next, Date.now())) {
      setError('Another tab is applying this batch. Wait for it to finish.')
      return
    }
    busy.current = true
    setRunningId(next.id)
    setError(undefined)
    try {
      saveBatch(next)
      setPreview(undefined)
      await runMnxBatch(next, saveBatch, send, () => active.current)
    } catch (error) {
      if (active.current) setError(errorMessage(error))
    } finally {
      busy.current = false
      if (active.current) {
        setRunningId(undefined)
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
      if (mode === 'liquidity')
        for (const { id, account, cost } of funders) {
          if (!account?.canFund)
            throw new Error(
              scope === 'mnx'
                ? 'The MNX account is not configured or is unavailable.'
                : `${creatorName(
                    id
                  )} is not an active perp creator account, so it cannot fund backing. Deselect its markets.`
            )
          if (cost > account.balance)
            throw new Error(
              `@${account.username} needs ${mana(cost)} to fund this batch.`
            )
        }
      const changedTargets =
        mode === 'visibility'
          ? targets.filter(({ contract }) => contract.visibility !== visibility)
          : targets
      if (!changedTargets.length)
        throw new Error(`The selected markets are already ${visibility}.`)
      const items: MnxBatchItem[] = changedTargets.map(
        ({ contract, minOraclePriceAgeMs }) => {
          const base = {
            title: perpLabel(contract),
            status: 'pending' as const,
          }
          if (mode === 'visibility')
            return {
              ...base,
              kind: 'visibility',
              previousVisibility: contract.visibility,
              params: { contractId: contract.id, visibility },
            }
          if (mode === 'liquidity')
            return {
              ...base,
              kind: 'liquidity',
              params: {
                contractId: contract.id,
                side,
                amount: Number(amount),
                fundingAccount: scope === 'mnx' ? 'mnx' : 'creator',
                idempotencyKey: randomString(),
                expectedManagerId: data.payer.id,
                ...(scope === 'all' && {
                  expectedFunderId: contract.creatorId,
                }),
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
        version: 2,
        id: randomString(),
        actorId: data.payer.id,
        createdAt: Date.now(),
        items,
      })
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  const finish = (batch: MnxBatch) => {
    try {
      // Only this batch's own entry: a batch another tab is applying, or has
      // not reconciled yet, keeps its request IDs.
      removeMnxBatch(localStorage, ENV, batch)
      setBatches((prev) => prev.filter((b) => b.id !== batch.id))
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
            {scope === 'mnx' ? 'Partner console' : 'Admin console'} · {ENV}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {scope === 'mnx' ? 'MNX markets' : 'Perp markets'}
            {isAdminId(data.payer.id) &&
              data.payer.id !== getMnxCreatorId(ENV) && (
                <ModActionTag admin className="ml-2 align-middle" />
              )}
          </h1>
          <p className="text-ink-500 mt-2 text-sm">
            {scope === 'all' && 'Every perp market, by creator. '}
            Backing, activity, and trading rules in one place.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            color="gray-outline"
            onClick={refresh}
            disabled={refreshing || !!runningId}
          >
            {refreshing ? 'Refreshing…' : 'Refresh stats'}
          </Button>
          <span className="text-ink-500 text-xs">
            Snapshot {new Date(data.asOf).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {scope === 'mnx' ? (
          <Stat
            label="MNX available balance"
            value={mnxAccount ? mana(mnxAccount.balance) : 'Not configured'}
            note={`${live.length} live · ${missing.length} feeds without an MNX market`}
          />
        ) : filter && creatorById[filter] ? (
          <Stat
            label={`${creatorName(filter)} available balance`}
            value={mana(creatorById[filter].balance)}
            note={`${live.length} live of ${shown.length} markets`}
          />
        ) : (
          <Stat
            label="Live markets"
            value={number(live.length)}
            note={`${shown.length - live.length} resolved · ${
              creatorIds.length
            } creators`}
          />
        )}
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

      <section
        className={panel}
        aria-label={scope === 'mnx' ? 'MNX markets' : 'Perp markets'}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="font-semibold">
              {scope === 'mnx' ? 'Your markets' : 'Markets'}
            </h2>
            <p className="text-ink-500 text-xs">
              Volume is margin opened and closed; fees are charged on opening
              notional.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scope === 'all' && (
              <label className="text-ink-500 flex items-center gap-2 text-xs">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="border-ink-300 bg-canvas-0 text-ink-1000 rounded-md border py-1.5 pl-2 pr-8 text-sm"
                >
                  {Object.entries(SORTS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
                : filter
                ? `Select all live ${creatorName(filter)}`
                : 'Select all live'}
            </Button>
          </div>
        </div>
        {scope === 'all' && creatorIds.length > 0 && (
          <div
            role="group"
            aria-label="Filter by creator"
            className="flex flex-wrap gap-2 px-4 pb-4"
          >
            {[null, ...creatorIds].map((id) => (
              <button
                key={id ?? 'all'}
                type="button"
                aria-pressed={filter === id}
                onClick={() => {
                  setCreatorFilter(id)
                  setSelected([])
                }}
                className={clsx(
                  'rounded-full border px-3 py-1 text-sm',
                  filter === id
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-ink-200 text-ink-600 hover:bg-canvas-50'
                )}
              >
                {id ? creatorName(id) : 'All creators'}{' '}
                <span className="text-ink-500 tabular-nums">
                  {id ? marketCounts[id] : data.markets.length}
                </span>
              </button>
            ))}
          </div>
        )}
        {data.markets.length > 0 ? (
          // relative: the sr-only header labels are absolutely positioned and
          // would otherwise widen the page instead of this scroll box.
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-ink-500 bg-canvas-50 border-ink-200 border-y text-xs">
                <tr>
                  <th className="p-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-3 pr-4">
                    Market / oracle{scope === 'all' && ' · creator'}
                  </th>
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
                {shown.map((market) => {
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
                          aria-label={`Select ${perpLabel(c)}`}
                          checked={selected.includes(c.id)}
                          disabled={locked || c.isResolved}
                          onChange={() => toggle(c.id)}
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <Link
                          href={contractPath(c)}
                          title={c.question}
                          className="text-primary-700 font-semibold hover:underline"
                        >
                          {perpLabel(c)}
                        </Link>
                        {scope === 'all' && (
                          <span className="text-ink-500 ml-1.5 whitespace-nowrap text-xs">
                            {creatorName(c.creatorId)}
                          </span>
                        )}
                        <div className="text-ink-500 whitespace-nowrap text-xs">
                          {formatOraclePrice(
                            c.oracleFeedId,
                            c.oraclePrice,
                            inferPriceDecimals([c.oraclePrice])
                          )}{' '}
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
            {scope === 'mnx'
              ? 'No MNX-owned markets yet. Markets created by the MNX launch script will appear here.'
              : 'No perp markets yet. Markets created from /admin/create-perp will appear here.'}
          </div>
        )}
        {scope === 'mnx' && missing.length > 0 && (
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

      {batches.length > 0 ? (
        batches.map((batch) => (
          <BatchResults
            key={batch.id}
            batch={batch}
            running={runningId === batch.id}
            elsewhere={
              runningId !== batch.id && isMnxBatchInProgress(batch, now)
            }
            onRetry={() => execute(batch)}
            onFinish={() => finish(batch)}
          />
        ))
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
                {mana(liquidityCost(preview.items))}{' '}
                {scope === 'mnx'
                  ? `from the MNX account (@${mnxAccount?.username})`
                  : 'from market creators'}
              </p>
              {scope === 'all' &&
                Object.entries(
                  groupBy(
                    preview.items,
                    (item) =>
                      data.markets.find(
                        (m) => m.contract.id === item.params.contractId
                      )?.contract.creatorId
                  )
                ).map(([id, items]) => (
                  <p key={id} className="text-ink-700 mt-1 text-sm">
                    {creatorName(id)} pays {mana(liquidityCost(items))} of{' '}
                    {mana(creatorById[id]?.balance ?? 0)} available
                  </p>
                ))}
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
                  ) : item.kind === 'visibility' ? (
                    <p className="text-ink-600">
                      Visibility: {item.previousVisibility} →{' '}
                      <b>{item.params.visibility}</b>
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
            <Button onClick={() => execute(preview)} disabled={!!runningId}>
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
                {one ? perpLabel(one) : `${targets.length} selected markets`}
              </h2>
              <p className="text-ink-500 mt-1 text-sm">
                Select one market for individual changes, or several for a bulk
                update.
              </p>
            </div>
            <div className="bg-canvas-50 flex flex-wrap gap-1 rounded-lg p-1">
              {(['liquidity', 'rules', 'visibility'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={mode === tab}
                  onClick={() => setMode(tab)}
                  className={clsx(
                    'rounded-md px-3 py-2 text-sm',
                    mode === tab
                      ? 'bg-canvas-0 text-primary-700 shadow-sm'
                      : 'text-ink-500'
                  )}
                >
                  {tab === 'liquidity'
                    ? 'Add liquidity'
                    : tab === 'rules'
                    ? 'Trading rules'
                    : 'Visibility'}
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
                {scope === 'mnx' ? (
                  <p className="text-ink-500 mt-3 text-sm">
                    {mnxAccount ? (
                      <>
                        Paid by the MNX account (<b>@{mnxAccount.username}</b>)
                        {' · '}
                        {mana(mnxAccount.balance)} available
                      </>
                    ) : (
                      'The MNX account is not configured or is unavailable.'
                    )}
                  </p>
                ) : (
                  <div className="text-ink-500 mt-3 space-y-1 text-sm">
                    <p>Paid by each market’s creator.</p>
                    {funders.map(({ id, account, cost }) => (
                      <p
                        key={id}
                        className={clsx(
                          (!account?.canFund ||
                            (Number.isFinite(cost) &&
                              cost > account.balance)) &&
                            'text-scarlet-600'
                        )}
                      >
                        <b>{creatorName(id)}</b>:{' '}
                        {account?.canFund
                          ? `${
                              Number.isFinite(cost) ? mana(cost) : '—'
                            } of ${mana(account.balance)} available`
                          : 'not a perp creator account; cannot fund'}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-ink-500 mt-2 text-xs">
                  Backing is committed to the markets. This does not buy LP
                  shares or a right to withdraw.
                </p>
              </div>
            </div>
          ) : mode === 'visibility' ? (
            <div className="mt-5">
              <fieldset>
                <legend className="text-sm font-medium">
                  Market visibility
                </legend>
                <div className="mt-3 flex flex-wrap gap-4">
                  {(['unlisted', 'public'] as const).map((value) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="mnx-visibility"
                        value={value}
                        checked={visibility === value}
                        onChange={() => setVisibility(value)}
                      />
                      {value === 'unlisted' ? 'Unlisted' : 'Public'}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-ink-500 mt-3 text-sm">
                Public markets appear in search and on /perps. Unlisted markets
                remain accessible and tradeable through their links.
              </p>
              <p className="text-ink-600 mt-2 text-sm">
                {
                  targets.filter(
                    ({ contract }) => contract.visibility !== visibility
                  ).length
                }{' '}
                of {targets.length} selected markets will change to {visibility}
                .
              </p>
            </div>
          ) : (
            <div className="mt-5">
              {mnxTargets && (
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
              )}
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
                  leverage caps apply to new opens and adds.
                  {mnxTargets &&
                    ' A cap can be set above the leverage MNX itself offers.'}
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
              disabled={
                !ready ||
                !targets.length ||
                refreshing ||
                (mode === 'liquidity' &&
                  funders.some(({ account }) => !account?.canFund)) ||
                (mode === 'visibility' &&
                  targets.every(
                    ({ contract }) => contract.visibility === visibility
                  ))
              }
            >
              Review{' '}
              {mode === 'liquidity'
                ? 'contribution'
                : mode === 'rules'
                ? 'rule changes'
                : 'visibility changes'}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

// Loads a console for the signed-in user. `load` must be stable.
export function PerpConsoleLoader({
  scope,
  userId,
  load,
  loadingText,
}: {
  scope: PerpConsoleScope
  userId: string
  load: () => Promise<PerpsDashboard>
  loadingText: string
}) {
  const [data, setData] = useState<PerpsDashboard>()
  const [error, setError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const active = useRef(true)
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const next = await load()
      if (active.current && next.payer.id === userId) {
        setData(next)
        setError(undefined)
      }
    } catch (error) {
      if (active.current) setError(errorMessage(error))
    } finally {
      if (active.current) setRefreshing(false)
    }
  }, [load, userId])
  useEffect(() => {
    active.current = true
    void refresh()
    return () => {
      active.current = false
    }
  }, [refresh])
  return (
    <>
      {error && (
        <p
          role="alert"
          className="bg-scarlet-50 text-scarlet-700 m-4 rounded-lg p-4"
        >
          {error}{' '}
          <button className="underline" onClick={refresh}>
            Retry
          </button>
        </p>
      )}
      {data ? (
        <PerpManagementConsole
          scope={scope}
          data={data}
          refresh={refresh}
          refreshing={refreshing}
        />
      ) : (
        !error && <p className="p-8">{loadingText}</p>
      )}
    </>
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

function BatchResults({
  batch,
  running,
  elsewhere,
  onRetry,
  onFinish,
}: {
  batch: MnxBatch
  running: boolean
  // Another tab is applying this batch right now.
  elsewhere: boolean
  onRetry: () => void
  onFinish: () => void
}) {
  const [acknowledge, setAcknowledge] = useState(false)
  const unfinished = batch.items.some((i) => i.status !== 'done')
  return (
    <section className={`${panel} p-5`} aria-live="polite">
      <h2 className="font-semibold">
        {running
          ? 'Applying batch…'
          : elsewhere
          ? 'Applying in another tab…'
          : 'Batch results'}{' '}
        · {batch.items.filter((i) => i.status === 'done').length}/
        {batch.items.length} complete
      </h2>
      <p className="text-ink-500 mt-1 text-sm">
        Completed markets are skipped on retry. Remaining liquidity requests
        keep their original request IDs.
      </p>
      {elsewhere && (
        <p className="text-ink-500 mt-1 text-sm">
          Another tab or window is applying this batch. If that tab was closed
          mid-run, this unlocks within a minute.
        </p>
      )}
      <ul className="my-4 space-y-2 text-sm">
        {batch.items.map((item) => (
          <li key={item.params.contractId}>
            <b>{item.title}</b>
            {item.kind === 'visibility' &&
              ` → ${item.params.visibility}`} ·{' '}
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
      {!running && !elsewhere && unfinished && (
        <>
          <Button onClick={onRetry}>Retry remaining</Button>
          <label className="text-ink-500 my-4 flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={acknowledge}
              onChange={(e) => setAcknowledge(e.target.checked)}
            />
            I have checked any uncertain results and want to end this batch
            without retrying.
            {batch.items.some((item) => item.kind === 'liquidity') &&
              ' A new liquidity batch would make new payments.'}
          </label>
        </>
      )}
      <Button
        color="gray-outline"
        disabled={running || elsewhere || (unfinished && !acknowledge)}
        onClick={onFinish}
      >
        Finish batch
      </Button>
    </section>
  )
}
