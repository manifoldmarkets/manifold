import { PerpContract } from 'common/contract'
import { MINUTE_MS } from 'common/util/time'
import { SupabaseDirectClient } from '../supabase/init'
import { runOracleUpdate } from './engine'
import { publishPerpQuote } from './publish-perp-quote'
import { applyOraclePointToLivePerps } from './apply-oracle-point'
jest.mock('../utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))
jest.mock('./engine', () => ({ runOracleUpdate: jest.fn() }))
jest.mock('./publish-perp-quote', () => ({ publishPerpQuote: jest.fn() }))
jest.mock('../notifications/perps', () => ({
  notifyPerpOracleResult: jest.fn(),
}))
const now = 1_800_000_000_000
const point = { ts: now, sourceTs: now, price: 2104 }
const health = {
  checkedAt: now + 2000,
  expiresAt: now + 5 * MINUTE_MS,
  status: 'available' as const,
}
const contract = {
  id: 'mnx',
  slug: 'mnx',
  mechanism: 'perp',
  oracleFeedId: 'mnx-anthropic-mark',
  oraclePriceTime: now,
  oracleSourceTime: now,
  oraclePrice: 2104,
  oracleFeedHealth: { ...health, checkedAt: now },
  poolLong: 25000,
  poolShort: 25000,
} as PerpContract
const database = (over: Partial<PerpContract> = {}) =>
  ({
    oneOrNone: jest.fn(async () => ({
      ts: new Date(now).toISOString(),
      source_ts: new Date(now).toISOString(),
      price: 2104,
    })),
    manyOrNone: jest.fn(async () => [{ data: { ...contract, ...over } }]),
  } as unknown as SupabaseDirectClient)
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(now + 2000)
})
afterEach(() => jest.restoreAllMocks())
it('does no engine work or quote push for an unchanged two-second check', async () => {
  await applyOraclePointToLivePerps(
    database(),
    contract.oracleFeedId,
    point,
    undefined,
    health
  )
  expect(runOracleUpdate).not.toHaveBeenCalled()
  expect(publishPerpQuote).not.toHaveBeenCalled()
})
it.each([false, true])(
  'pushes the committed health and pools, including solvency halt=%s',
  async (halted) => {
    jest.mocked(runOracleUpdate).mockResolvedValue({
      oracleFeedHealth: health,
      liquidated: [],
      adlAdjusted: [],
      adlSettled: [],
      adlFactorLong: 1,
      adlFactorShort: 1,
      poolLongBefore: 25000,
      poolLongAfter: 24000,
      poolShortBefore: 25000,
      poolShortAfter: 26000,
      ...(halted ? { solvencyHalt: { reason: 'fixture' } } : {}),
    })
    await applyOraclePointToLivePerps(
      database({ oracleFeedHealth: { checkedAt: now, status: 'unavailable' } }),
      contract.oracleFeedId,
      point,
      undefined,
      health
    )
    expect(runOracleUpdate).toHaveBeenCalledTimes(1)
    expect(publishPerpQuote).toHaveBeenCalledTimes(1)
    expect(publishPerpQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 'mnx',
        oraclePrice: 2104,
        oraclePriceTime: now,
        oracleFeedHealth: health,
        poolLong: 24000,
        poolShort: 26000,
      })
    )
  }
)
