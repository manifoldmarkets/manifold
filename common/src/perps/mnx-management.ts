import { APIParams } from 'common/api/schema'
import { PerpContract } from 'common/contract'
import { getFundingPeriodMs } from 'common/perps/funding'
import { PerpConfigPatch, perpConfigFields } from 'common/perps/management'
import { YEAR_MS } from 'common/util/time'

export const MNX_RULE_FIELDS = [
  { key: 'takerFeeBps', label: 'Web base fee', unit: 'bps', min: 0, max: 100 },
  {
    key: 'takerFeeApiBps',
    label: 'API base fee',
    unit: 'bps',
    min: 0,
    max: 300,
  },
  {
    key: 'takerFeeImpact',
    label: 'Size-impact coefficient',
    unit: '',
    min: 0,
    max: 100,
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
      patch.maxOraclePriceAgeMs = value * 1000
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
)
export type MnxBatch = {
  version: 1
  actorId: string
  createdAt: number
  items: MnxBatchItem[]
}

// Stop on the first error. Persist BEFORE each request and after each result.
// A crash between a commit and saving 'done' replays the same request key.
export const runMnxBatch = async (
  batch: MnxBatch,
  save: (batch: MnxBatch) => void,
  send: (item: MnxBatchItem) => Promise<unknown>,
  isActive: () => boolean
) => {
  let current = { ...batch, items: batch.items.map((i) => ({ ...i })) }
  const update = (index: number, changes: Partial<MnxBatchItem>) => {
    current = {
      ...current,
      items: current.items.map((item, i) =>
        i === index ? ({ ...item, ...changes } as MnxBatchItem) : item
      ),
    }
  }
  for (let index = 0; index < current.items.length; index++) {
    if (!isActive()) break
    if (current.items[index].status === 'done') continue
    update(index, { status: 'pending', error: undefined })
    save(current)
    try {
      await send(current.items[index])
      update(index, { status: 'done' })
    } catch (error) {
      update(index, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
      save(current)
      break
    }
    save(current)
    // Never mutate a React state object or a saved preview on the next pass.
    current = { ...current, items: [...current.items] }
  }
  return current
}
