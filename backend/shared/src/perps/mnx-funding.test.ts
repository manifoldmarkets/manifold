import { PerpContract } from 'common/contract'
import { OracleFeedHealth } from 'common/perps/mnx'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { SupabaseTransaction } from '../supabase/init'
import { runTransactionWithRetries } from '../transact-with-retries'
import { runFunding } from './engine'

jest.mock('../transact-with-retries', () => ({
  runTransactionWithRetries: jest.fn(),
}))
jest.mock('../utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))

const now = 1_800_000_000_000
const health: OracleFeedHealth = {
  checkedAt: now,
  status: 'available',
  priceTime: now - HOUR_MS,
  price: 3,
}

const database = (overrides: Partial<PerpContract> = {}) => {
  const contract = {
    id: 'h100',
    slug: 'h100',
    mechanism: 'perp',
    isResolved: false,
    oracleFeedId: 'mnx-h100-mark',
    oraclePrice: 3,
    oraclePriceTime: now - HOUR_MS,
    oracleFeedHealth: health,
    maxOraclePriceAgeMs: DAY_MS,
    createdTime: now,
    fundingPeriodMs: HOUR_MS,
    poolLong: 25000,
    poolShort: 25000,
    ...overrides,
  }
  const one = jest.fn(async (_sql: string) => ({}))
  const fundingRead = jest.fn(async () => null)
  const oneOrNone = jest.fn(async (sql: string) => {
    if (sql.includes('contract_perp_funding_events')) return fundingRead()
    return { data: contract, token: 'MANA' }
  })
  const writes = jest.fn()
  const tx = {
    one,
    oneOrNone,
    any: jest.fn(async () => []),
    multi: writes,
    none: writes,
  }
  jest
    .mocked(runTransactionWithRetries)
    .mockImplementation(async (run) =>
      run(tx as unknown as SupabaseTransaction)
    )
  return { contract, one, oneOrNone, fundingRead, writes }
}

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now))
afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

it.each([
  ['missing health', undefined],
  ['frozen', { ...health, status: 'unavailable' as const, reason: 'Frozen' }],
  ['stopped collector', { ...health, checkedAt: now - 6 * MINUTE_MS }],
  ['pending price', { ...health, price: 4 }],
])(
  'skips funding before any funding queries or writes: %s',
  async (_name, oracleFeedHealth) => {
    const db = database({ oracleFeedHealth })
    // An old scheduler timestamp cannot make a stopped collector appear fresh.
    expect(await runFunding('h100', now - 10 * MINUTE_MS)).toBeNull()
    expect(db.one.mock.calls[0][0]).toContain('pg_advisory_xact_lock')
    expect(db.oneOrNone).toHaveBeenCalledTimes(1)
    expect(db.fundingRead).not.toHaveBeenCalled()
    expect(db.writes).not.toHaveBeenCalled()
  }
)

it.each([
  ['healthy H100', {}],
  [
    'existing provider',
    { oracleFeedId: 'btc-usd', oracleFeedHealth: undefined },
  ],
])(
  'continues to the ordinary funding cadence gate for %s',
  async (_name, overrides) => {
    const db = database(overrides)
    expect(await runFunding('h100', now)).toBeNull() // first period is not due
    expect(db.fundingRead).toHaveBeenCalledTimes(1)
    expect(db.writes).not.toHaveBeenCalled()
  }
)

it('resumes the funding cadence after health recovers at the same price timestamp', async () => {
  const db = database({
    oracleFeedHealth: { ...health, status: 'unavailable' },
  })
  expect(await runFunding('h100', now)).toBeNull()
  expect(db.fundingRead).not.toHaveBeenCalled()
  db.contract.oracleFeedHealth = health
  expect(await runFunding('h100', now)).toBeNull()
  expect(db.fundingRead).toHaveBeenCalledTimes(1)
})
