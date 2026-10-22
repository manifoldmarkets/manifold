import { APIParams } from 'common/api/schema'
import { PerpContract } from 'common/contract'
import {
  PERP_TAKER_FEE_API_BPS_MAX,
  PERP_TAKER_FEE_BPS_MAX,
  PERP_TAKER_FEE_IMPACT_MAX,
} from 'common/perps/fees'
import { getFundingPeriodMs } from 'common/perps/funding'
import { PerpConfigPatch, perpConfigFields } from 'common/perps/management'
import { YEAR_MS } from 'common/util/time'

export const MNX_RULE_FIELDS = [
  {
    key: 'takerFeeBps',
    label: 'Web base fee',
    unit: 'bps',
    min: 0,
    max: PERP_TAKER_FEE_BPS_MAX,
  },
  {
    key: 'takerFeeApiBps',
    label: 'API base fee',
    unit: 'bps',
    min: 0,
    max: PERP_TAKER_FEE_API_BPS_MAX,
  },
  {
    key: 'takerFeeImpact',
    label: 'Size-impact coefficient',
    unit: '',
    min: 0,
    max: PERP_TAKER_FEE_IMPACT_MAX,
  },
  {
    key: 'maxLeverage',
    label: 'Maximum leverage',
    unit: '×',
    min: 1.01,
    max: 100,
  },
  { key: 'annualFunding', label: 'Annualized funding cap', unit: '%', min: 0 },
  {
    key: 'fundingSensitivity',
    label: 'Funding sensitivity',
    unit: '',
    min: 0.01,
    max: 100,
  },
  {
    key: 'oracleAgeSeconds',
    label: 'Maximum mark age',
    unit: 'seconds',
    min: 1,
  },
] as const
export type RuleField = (typeof MNX_RULE_FIELDS)[number]['key']
export type MnxRuleForm = Partial<Record<RuleField, string>>

export const ruleValue = (contract: PerpContract, key: RuleField) =>
  key === 'annualFunding'
    ? (contract.maxFundingRate * YEAR_MS * 100) / getFundingPeriodMs(contract)
    : key === 'oracleAgeSeconds'
    ? contract.maxOraclePriceAgeMs / 1000
    : contract[key] ?? 0

export const buildMnxRulePatch = (
  form: MnxRuleForm,
  contract: PerpContract
): PerpConfigPatch => {
  const patch: PerpConfigPatch = {}
  for (const { key, label } of MNX_RULE_FIELDS) {
    if (!form[key]?.trim()) continue
    const value = Number(form[key])
    if (!Number.isFinite(value)) throw new Error(`${label} must be a number.`)
    if (key === 'annualFunding')
      patch.maxFundingRate =
        ((value / 100) * getFundingPeriodMs(contract)) / YEAR_MS
    else if (key === 'oracleAgeSeconds')
      // 1.005 * 1000 is not an integer in floating point.
      patch.maxOraclePriceAgeMs = Math.round(value * 1000)
    else patch[key] = value
  }
  if (!Object.keys(patch).length)
    throw new Error('Enter at least one rule to change.')
  const parsed = perpConfigFields.safeParse(patch)
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
    )
  return parsed.data
}

export type MnxBatchItem = {
  title: string
  status: 'pending' | 'done' | 'error'
  error?: string
} & (
  | { kind: 'liquidity'; params: APIParams<'add-perp-subsidy'> }
  | { kind: 'rules'; params: APIParams<'update-perp-config'> }
  | {
      kind: 'visibility'
      previousVisibility: PerpContract['visibility']
      params: Pick<APIParams<'market/:contractId/update'>, 'contractId'> & {
        visibility: 'unlisted' | 'public'
      }
    }
)
export type MnxBatch = {
  version: 2
  id: string
  actorId: string
  createdAt: number
  // Set while a tab is applying the batch, refreshed before every request.
  // Other tabs treat it as abandoned after MNX_BATCH_STALE_MS.
  runningAt?: number
  items: MnxBatchItem[]
}

// A client waits this long for one response before giving up on it.
export const MNX_REQUEST_TIMEOUT_MS = 30_000
// Longer than one request, so a live run in another tab is never mistaken
// for a crashed one.
export const MNX_BATCH_STALE_MS = 2 * MNX_REQUEST_TIMEOUT_MS

export const isMnxBatchInProgress = (batch: MnxBatch, now: number) =>
  batch.runningAt !== undefined && now - batch.runningAt < MNX_BATCH_STALE_MS

// The subset of Storage the batch persistence uses, so it can be tested
// without a DOM and swapped for another store.
export type MnxBatchStorage = {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// Every batch gets its own entry: finishing or retrying one batch must never
// overwrite or delete another tab's batch, whose entry is the only record of
// the payment request IDs that make a retry safe.
export const mnxBatchKeyPrefix = (env: string, actorId: string) =>
  `mnx-batch-v2:${env}:${actorId}:`
export const mnxBatchKey = (
  env: string,
  batch: Pick<MnxBatch, 'actorId' | 'id'>
) => mnxBatchKeyPrefix(env, batch.actorId) + batch.id

export const saveMnxBatch = (
  storage: MnxBatchStorage,
  env: string,
  batch: MnxBatch
) => storage.setItem(mnxBatchKey(env, batch), JSON.stringify(batch))

export const removeMnxBatch = (
  storage: MnxBatchStorage,
  env: string,
  batch: Pick<MnxBatch, 'actorId' | 'id'>
) => storage.removeItem(mnxBatchKey(env, batch))

const parseMnxBatch = (raw: string | null, actorId: string) => {
  try {
    const batch = JSON.parse(raw ?? '') as MnxBatch
    return batch.version === 2 &&
      typeof batch.id === 'string' &&
      batch.actorId === actorId &&
      Array.isArray(batch.items)
      ? batch
      : undefined
  } catch {
    return undefined
  }
}

// Every unfinished batch this account saved, oldest first. Throws if one
// cannot be read: the operator must keep it for recovery rather than start a
// batch that would pay again.
export const readMnxBatches = (
  storage: MnxBatchStorage,
  env: string,
  actorId: string
) => {
  const prefix = mnxBatchKeyPrefix(env, actorId)
  const batches: MnxBatch[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key?.startsWith(prefix)) continue
    const batch = parseMnxBatch(storage.getItem(key), actorId)
    if (!batch || mnxBatchKey(env, batch) !== key)
      throw new Error(
        'A saved MNX batch could not be read. Keep it for recovery before starting another batch.'
      )
    batches.push(batch)
  }
  return batches.sort((a, b) => a.createdAt - b.createdAt)
}

// Stop on the first error. Persist BEFORE each request and after each result.
// A crash between a commit and saving 'done' replays the same request key.
export const runMnxBatch = async (
  batch: MnxBatch,
  save: (batch: MnxBatch) => void,
  send: (item: MnxBatchItem) => Promise<unknown>,
  isActive: () => boolean
) => {
  let current: MnxBatch = {
    ...batch,
    items: batch.items.map((i) => ({ ...i })),
  }
  // Every save receives a fresh object, so React state and earlier saves are
  // never mutated by a later pass.
  const persist = (changes: Partial<MnxBatch>) => {
    current = { ...current, ...changes }
    save(current)
  }
  const withItem = (index: number, changes: Partial<MnxBatchItem>) => ({
    items: current.items.map((item, i) =>
      i === index ? ({ ...item, ...changes } as MnxBatchItem) : item
    ),
  })
  try {
    for (let index = 0; index < current.items.length; index++) {
      if (!isActive()) break
      if (current.items[index].status === 'done') continue
      persist({
        ...withItem(index, { status: 'pending', error: undefined }),
        runningAt: Date.now(),
      })
      try {
        const item = current.items[index]
        // Old receipts are keyed to the original payer. Changing their funding
        // account on retry could debit MNX for an already-committed payment.
        if (item.kind === 'liquidity' && item.params.fundingAccount !== 'mnx')
          throw new Error(
            'This saved contribution used the signed-in account. Check its payment results and finish the batch before creating a new MNX-funded contribution.'
          )
        await send(item)
      } catch (error) {
        persist(
          withItem(index, {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          })
        )
        break
      }
      persist(withItem(index, { status: 'done' }))
    }
  } finally {
    if (current.runningAt !== undefined) {
      current = { ...current, runningAt: undefined }
      try {
        save(current)
      } catch {
        // Results were already saved; the marker expires on its own.
      }
    }
  }
  return current
}
