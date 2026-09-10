import { PerpContract } from 'common/contract'
import { PerpPosition } from 'common/perps/position'
import { OracleFeedHealth } from 'common/perps/oracle-health'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { SupabaseTransaction } from '../supabase/init'
import { runTransactionWithRetries } from '../transact-with-retries'
import {
  runFunding,
  runOracleUpdate,
  openOrAddPosition,
  applyOracleUpdate,
} from './engine'
import { getPerpOracleFreshness } from 'common/perps/oracle'

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
  expiresAt: now + 5 * MINUTE_MS,
}

const database = (
  overrides: Partial<PerpContract> = {},
  positions: PerpPosition[] = []
) => {
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
    fundingSensitivity: 1,
    maxFundingRate: 0.0001,
    poolLong: 25000,
    poolShort: 25000,
    ...overrides,
  }
  const one = jest.fn(async (sql: string) =>
    sql.includes('from txns') ? { balance: 50000 } : {}
  )
  const fundingRead = jest.fn(async () => null)
  const oneOrNone = jest.fn(async (sql: string) => {
    if (sql.includes('contract_perp_funding_events')) return fundingRead()
    if (sql.includes('system_trading_status')) return { status: true }
    if (sql.includes('from users'))
      return { id: 'user', balance: 10000, data: {} }
    return { data: contract, token: 'MANA' }
  })
  const writes = jest.fn()
  const tx = {
    one,
    oneOrNone,
    any: jest.fn(async (sql: string) =>
      sql.includes('from contract_perp_events')
        ? []
        : positions.map((p) => ({
            contract_id: p.contractId,
            user_id: p.userId,
            direction: p.direction,
            size: p.size,
            cost_basis: p.costBasis,
            original_cost_basis: p.originalCostBasis,
            taker_fee_cost_basis: p.takerFeeCostBasis ?? 0,
            entry_price: p.entryPrice,
            leverage: p.leverage,
            liquidation_price: p.liquidationPrice,
            opened_time: new Date(p.openedTime),
            updated_time: new Date(p.updatedTime),
          }))
    ),
    manyOrNone: jest.fn(async () => []),
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
  ['frozen', { ...health, status: 'unavailable' as const, reason: 'Frozen' }],
  ['stopped collector', { ...health, checkedAt: now - 6 * MINUTE_MS }],
  ['expired source', { ...health, expiresAt: now - 1 }],
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

it('executes one funding period after recovery, without back-charging missed periods', async () => {
  const db = database({
    createdTime: now - 10 * HOUR_MS,
    oracleFeedHealth: { ...health, status: 'unavailable' },
  })
  expect(await runFunding('h100', now)).toBeNull()
  db.contract.oracleFeedHealth = health
  const result = await runFunding('h100', now)
  expect(result?.fundingEvent.ts).toBe(now)
  expect(db.writes).toHaveBeenCalledTimes(1)
  expect(db.writes.mock.calls[0][0]).toContain('contract_perp_funding_events')
})

it('commits healthy price and health in one engine write, leaving the previous mark executable until commit', async () => {
  const db = database({
    oraclePriceTime: now - 2000,
    oracleFeedHealth: { ...health, checkedAt: now - 2000 },
  })
  expect(getPerpOracleFreshness(db.contract, now).status).toBe('fresh')
  const result = await runOracleUpdate('h100', 3.1, now, now, undefined, health)
  const mutations = db.one.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('update contracts'))
  expect(mutations).toHaveLength(1)
  expect(mutations[0]).toContain('oraclePrice')
  expect(mutations[0]).toContain('oracleFeedHealth')
  expect(result?.oracleFeedHealth).toEqual(health)
})

const liquidatable: PerpPosition = {
  contractId: 'h100',
  userId: 'user',
  direction: 'long',
  size: 10000,
  costBasis: 1000,
  originalCostBasis: 1000,
  takerFeeCostBasis: 0,
  entryPrice: 4,
  leverage: 10,
  liquidationPrice: 3.6,
  openedTime: now - HOUR_MS,
  updatedTime: now - HOUR_MS,
}

it('recovers at an unchanged price without replaying a liquidatable position', async () => {
  const db = database(
    {
      oraclePriceTime: now,
      oracleSourceTime: now,
      oracleFeedHealth: { checkedAt: now - 2000, status: 'unavailable' },
    },
    [liquidatable]
  )
  // Prove the fixture would detect accidentally entering the liquidation path.
  expect(
    applyOracleUpdate(
      db.contract as PerpContract,
      {
        pool: { L: 25000, S: 25000 },
        positions: [liquidatable],
      },
      3,
      now,
      now
    ).liquidated
  ).toHaveLength(1)
  const result = await runOracleUpdate('h100', 3, now, now, undefined, health)
  expect(result?.liquidated).toEqual([])
  expect(result?.oracleFeedHealth).toEqual(health)
  const updates = db.one.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('update contracts'))
  expect(updates).toHaveLength(1)
  expect(updates[0]).toContain('oracleFeedHealth')
  expect(updates[0]).not.toMatch(/oraclePrice|poolLong|poolShort/)
  expect(db.writes).not.toHaveBeenCalled()
})

it('carries health through a liquidating multi-statement transaction', async () => {
  const db = database(
    {
      oraclePrice: 4,
      oraclePriceTime: now - 2000,
      oracleFeedHealth: { ...health, checkedAt: now - 2000 },
    },
    [liquidatable]
  )
  const result = await runOracleUpdate('h100', 3, now, now, undefined, health)
  expect(result?.liquidated).toHaveLength(1)
  expect(result?.oracleFeedHealth).toEqual(health)
  expect(db.writes).toHaveBeenCalledTimes(1)
  expect(db.writes.mock.calls[0][0]).toContain('oracleFeedHealth')
  expect(db.writes.mock.calls[0][0]).toContain('oraclePrice')
})

it('preserves health on a solvency halt without committing corrupt positions', async () => {
  const db = database(
    {
      oraclePriceTime: now - 2000,
      oracleFeedHealth: { ...health, checkedAt: now - 2000 },
    },
    [{ ...liquidatable, size: NaN }]
  )
  const result = await runOracleUpdate('h100', 3, now, now, undefined, health)
  expect(result?.solvencyHalt).toBeDefined()
  expect(result?.oracleFeedHealth).toEqual(health)
  const updates = db.one.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes('update contracts'))
  expect(updates).toHaveLength(1)
  expect(updates[0]).toContain('oracleFeedHealth')
  expect(updates[0]).toContain('solvencyHaltTime')
  expect(db.writes).not.toHaveBeenCalled()
})

it('rejects an hourly price apply without fresh provider health under the lock', async () => {
  const db = database({ oracleFeedHealth: { ...health, expiresAt: now - 1 } }, [
    liquidatable,
  ])
  expect(await runOracleUpdate('h100', 3, now, now)).toBeNull()
  expect(db.one).toHaveBeenCalledTimes(1)
  expect(db.writes).not.toHaveBeenCalled()
})

it('does not let a delayed available observation clear a newer freeze', async () => {
  const db = database({
    oracleFeedHealth: { checkedAt: now + 1, status: 'unavailable' },
  })
  expect(
    await runOracleUpdate('h100', 3.1, now, now, undefined, health)
  ).toBeNull()
  expect(db.one).toHaveBeenCalledTimes(1) // lock only
})

it('the trading engine refuses a frozen provider before balance or position writes', async () => {
  const db = database({
    oracleFeedHealth: { ...health, status: 'unavailable', reason: 'Frozen' },
  })
  await expect(
    openOrAddPosition('h100', 'user', 'long', 100, 2)
  ).rejects.toThrow(/Frozen/)
  expect(db.writes).not.toHaveBeenCalled()
})
