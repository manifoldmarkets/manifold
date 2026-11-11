// Exercise the real helper's transaction/side-effect boundaries with an offline
// database adapter. Payout inputs are empty; no live database or network is used.
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: {},
}))
jest.mock('./utils', () => ({
  getContractAndMetricsAndLiquidities: jest.fn(),
  isProd: () => true,
  log: jest.fn(),
  revalidateStaticProps: jest.fn(),
}))
jest.mock('./helpers/user-contract-loans', () => ({
  getLoanTrackingForContract: jest.fn().mockResolvedValue([]),
}))
jest.mock('./analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('./record-contract-edit', () => ({ recordContractEdit: jest.fn() }))
jest.mock('./create-notification', () => ({
  createContractResolvedNotifications: jest.fn(),
}))
jest.mock('./helpers/user-contract-metrics', () => ({
  bulkUpdateContractMetricsQuery: () => 'select 1',
}))
jest.mock('./supabase/answers', () => ({
  updateAnswer: jest.fn(),
  updateAnswers: jest.fn(),
}))
jest.mock('./supabase/users', () => ({
  bulkIncrementBalancesQuery: () => 'select 1',
}))
jest.mock('./supabase/utils', () => ({
  bulkInsertQuery: () => 'select 1',
  updateDataQuery: () => 'update contracts',
}))
jest.mock('./txn/run-txn', () => ({ txnToRow: jest.fn() }))
jest.mock('./websockets/helpers', () => ({
  broadcastUpdatedContract: jest.fn(),
  broadcastUpdatedMetrics: jest.fn(),
}))

import { APIError } from 'common/api/utils'
import { MarketContract } from 'common/contract'
import { User } from 'common/user'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from './supabase/init'
import {
  getContractAndMetricsAndLiquidities,
  revalidateStaticProps,
} from './utils'
import { broadcastUpdatedContract } from './websockets/helpers'
import { resolveMarketHelper } from './resolve-market-helpers'

const contract = {
  id: 'game',
  slug: 'game',
  creatorUsername: 'sports',
  visibility: 'public',
  mechanism: 'cpmm-1',
  outcomeType: 'BINARY',
  token: 'MANA',
  prob: 0.5,
  pool: { YES: 100, NO: 100 },
  p: 0.5,
  subsidyPool: 0,
  uniqueBettorCount: 0,
  isResolved: false,
} as unknown as MarketContract
const user = { id: 'sports' } as User
const multi = jest.fn().mockResolvedValue([[], [], [], []])
const commit = jest.fn().mockResolvedValue(undefined)
const tx = jest.fn(
  async (
    _options: unknown,
    work: (task: SupabaseTransaction) => Promise<unknown>
  ) => {
    const result = await work({ multi } as unknown as SupabaseTransaction)
    await commit()
    return result
  }
)

beforeEach(() => {
  jest.clearAllMocks()
  commit.mockReset().mockResolvedValue(undefined)
  jest.mocked(revalidateStaticProps).mockReset().mockResolvedValue(undefined)
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue({ tx } as unknown as ReturnType<
      typeof createSupabaseDirectClient
    >)
  jest.mocked(getContractAndMetricsAndLiquidities).mockResolvedValue({
    contract,
    liquidities: [],
    contractMetrics: [],
  })
})

it('reports commit only after the transaction promise succeeds, before post-commit effects', async () => {
  let release!: () => void
  let entered!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const waiting = new Promise<void>((resolve) => {
    entered = resolve
  })
  commit.mockImplementationOnce(() => {
    entered()
    return pending
  })
  const observe = jest.fn()
  const result = resolveMarketHelper(
    contract,
    user,
    user,
    { outcome: 'YES' },
    observe
  )
  await waiting
  expect(multi).toHaveBeenCalledTimes(1)
  expect(observe.mock.calls).toEqual([['started']])
  expect(broadcastUpdatedContract).not.toHaveBeenCalled()
  release()
  await result
  expect(observe.mock.calls).toEqual([['started'], ['committed']])
  expect(observe.mock.invocationCallOrder[1]).toBeLessThan(
    jest.mocked(broadcastUpdatedContract).mock.invocationCallOrder[0]
  )
})

it('preserves the committed outcome when revalidation rejects', async () => {
  const error = new Error('revalidation failed')
  jest.mocked(revalidateStaticProps).mockRejectedValueOnce(error)
  const observe = jest.fn()
  await expect(
    resolveMarketHelper(contract, user, user, { outcome: 'YES' }, observe)
  ).rejects.toBe(error)
  expect(observe.mock.calls).toEqual([['started'], ['committed']])
  expect(commit).toHaveBeenCalledTimes(1)
})

it('does not report commit when the commit acknowledgement is lost', async () => {
  const error = new Error('Query read timeout')
  commit.mockRejectedValueOnce(error)
  const observe = jest.fn()
  await expect(
    resolveMarketHelper(contract, user, user, { outcome: 'YES' }, observe)
  ).rejects.toBe(error)
  expect(observe.mock.calls).toEqual([['started']])
  expect(broadcastUpdatedContract).not.toHaveBeenCalled()
})

it('reports no transaction work when connection acquisition fails', async () => {
  const error = new Error('connection acquisition failed')
  tx.mockRejectedValueOnce(error)
  const observe = jest.fn()
  await expect(
    resolveMarketHelper(contract, user, user, { outcome: 'YES' }, observe)
  ).rejects.toBe(error)
  expect(observe).not.toHaveBeenCalled()
  expect(multi).not.toHaveBeenCalled()
})

it('keeps the canonical APIError identity for an already-resolved contract', async () => {
  jest.mocked(getContractAndMetricsAndLiquidities).mockResolvedValueOnce({
    contract: { ...contract, isResolved: true },
    liquidities: [],
    contractMetrics: [],
  })
  const observe = jest.fn()
  await expect(
    resolveMarketHelper(contract, user, user, { outcome: 'YES' }, observe)
  ).rejects.toBeInstanceOf(APIError)
  expect(observe.mock.calls).toEqual([['started']])
  expect(multi).not.toHaveBeenCalled()
})

it("runs the caller's check on the transaction's read and writes nothing when it refuses", async () => {
  const fresh = { ...contract, question: 'read inside the transaction' }
  jest.mocked(getContractAndMetricsAndLiquidities).mockResolvedValueOnce({
    contract: fresh,
    liquidities: [],
    contractMetrics: [],
  })
  const refusal = new Error('another answer was resolved meanwhile')
  const check = jest.fn(() => {
    throw refusal
  })
  await expect(
    resolveMarketHelper(
      contract,
      user,
      user,
      { outcome: 'YES' },
      undefined,
      check
    )
  ).rejects.toBe(refusal)
  expect(check).toHaveBeenCalledWith(fresh)
  expect(multi).not.toHaveBeenCalled()
  expect(commit).not.toHaveBeenCalled()
  expect(broadcastUpdatedContract).not.toHaveBeenCalled()
})
