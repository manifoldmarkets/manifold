import { PerpContract } from 'common/contract'
import { PerpPosition } from 'common/perps/position'
import { SupabaseTransaction } from '../supabase/init'
import { buildPerpUserContractMetrics } from './user-contract-metrics'

jest.mock('shared/helpers/user-contract-metrics', () => ({
  bulkUpdateContractMetricsQuery: jest.fn(),
}))

const contract = { id: 'market', oraclePrice: 100 } as PerpContract
const snapshot = (amount: number, positions: PerpPosition[] = []) =>
  buildPerpUserContractMetrics(
    {
      any: async () => [],
      manyOrNone: async () => [{ user_id: 'alice', amount }],
    } as unknown as SupabaseTransaction,
    { contract, userIds: ['alice'], finalPositions: positions }
  )

it('keeps pending collateral in portfolio value without creating profit', async () => {
  const [metric] = await snapshot(101)
  expect(metric.payout).toBe(101)
  expect(metric.invested).toBe(101)
  expect(metric.profit).toBe(0)
  expect(metric.hasShares).toBe(true)
  expect(metric.totalShares).toEqual({ LONG: 0, SHORT: 0 })
})
it('does not manufacture a loss when an expired reservation disappears', async () => {
  const [pending] = await snapshot(101)
  const [expired] = await snapshot(0)
  expect(899 + pending.payout).toBe(1000)
  expect(1000 + expired.payout).toBe(1000)
  expect(expired.profit).toBe(0)
})
it('fails closed on a corrupt reservation', async () => {
  await expect(snapshot(NaN)).rejects.toThrow('Invalid pending PERP reserve')
  await expect(snapshot(-1)).rejects.toThrow('Invalid pending PERP reserve')
})
