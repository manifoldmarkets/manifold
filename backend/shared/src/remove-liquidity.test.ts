import { Request } from 'express'
import { removeLiquidity } from 'api/remove-liquidity'
import { AuthedUser } from 'api/helpers/endpoint'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { CPMMContract } from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import { getLiquidityPoolPayouts } from 'common/payouts-fixed'
import { Row } from 'common/supabase/utils'
import { User } from 'common/user'
import { createLiquidityReturnedNotifications } from 'shared/notifications/create-liquidity-returned-notifications'
import { updateContract } from 'shared/supabase/contracts'
import { SupabaseTransaction } from 'shared/supabase/init'
import { insertLiquidity } from 'shared/supabase/liquidity'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getContract, getUser } from 'shared/utils'
import { broadcastNewSubsidy } from 'shared/websockets/helpers'

jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('shared/utils', () => ({
  getUser: jest.fn(),
  getContract: jest.fn(),
  log: jest.fn(),
}))
jest.mock('shared/transact-with-retries', () => ({
  runTransactionWithRetries: jest.fn(),
}))
jest.mock('shared/supabase/contracts', () => ({ updateContract: jest.fn() }))
jest.mock('shared/supabase/liquidity', () => ({ insertLiquidity: jest.fn() }))
jest.mock('shared/supabase/utils', () => ({
  FieldVal: { increment: (delta: number) => () => String(delta) },
}))
jest.mock('shared/txn/run-txn', () => ({ runTxnInBetQueue: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastNewSubsidy: jest.fn(),
}))
jest.mock(
  'shared/notifications/create-liquidity-returned-notifications',
  () => ({
    createLiquidityReturnedNotifications: jest.fn(),
  })
)

// Exercise the real handler and payout math. Only persistence/auth/side effects
// are replaced. This in-memory adapter makes no claim about PostgreSQL locking.
const lp = (
  userId: string,
  amount: number,
  id: string
): LiquidityProvision => ({
  id,
  userId,
  amount,
  contractId: 'market',
  createdTime: 0,
})
const row = (provision: LiquidityProvision): Row<'contract_liquidity'> => ({
  liquidity_id: provision.id,
  contract_id: provision.contractId,
  created_time: new Date(provision.createdTime).toISOString(),
  user_id: provision.userId,
  data: provision,
})

let contract: CPMMContract
let liquidities: LiquidityProvision[]
let payments: Parameters<typeof runTxnInBetQueue>[1][]
let inserted: LiquidityProvision[]
const transaction = {
  map: jest.fn(async () => liquidities.map((provision) => ({ ...provision }))),
} as unknown as SupabaseTransaction

const invoke = async (amount: number, uid = 'alice') => {
  const response = await removeLiquidity(
    { contractId: 'market', amount },
    { uid } as AuthedUser,
    {} as Request
  )
  if (!('result' in response)) throw new Error('Missing continuation response')
  return response
}

const payouts = (outcome: 'YES' | 'NO') =>
  Object.fromEntries(
    getLiquidityPoolPayouts(contract, outcome, liquidities).map((payout) => [
      payout.userId,
      payout.payout,
    ])
  )

beforeEach(() => {
  jest.clearAllMocks()
  contract = {
    id: 'market',
    slug: 'market',
    creatorId: 'alice',
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    token: 'M$',
    visibility: 'public',
    pool: { YES: 900, NO: 2100 },
    p: 0.5,
    subsidyPool: 400,
    totalLiquidity: 5800,
  } as unknown as CPMMContract
  liquidities = [
    lp('alice', 1000, 'a'),
    lp('bob', 3000, 'b'),
    lp('carol', 2100, 'c'),
    lp('carol', -100, 'cw'),
    lp('zero', 300, 'z'),
    lp('zero', -300, 'zw'),
    lp('negative', 100, 'n'),
    lp('negative', -300, 'nw'),
  ]
  payments = []
  inserted = []
  jest.mocked(getUser).mockResolvedValue({ id: 'alice' } as User)
  jest.mocked(getContract).mockImplementation(async () => ({ ...contract }))
  jest
    .mocked(runTransactionWithRetries)
    .mockImplementation((fn) => fn(transaction))
  jest.mocked(updateContract).mockImplementation(async (_pg, id, update) => {
    expect(id).toBe(contract.id)
    const binaryUpdate = update as {
      pool?: CPMMContract['pool']
      p?: number
      subsidyPool?: (field: string) => string
      totalLiquidity?: (field: string) => string
    }
    for (const field of ['subsidyPool', 'totalLiquidity'] as const) {
      const change = binaryUpdate[field]
      if (typeof change === 'function') {
        const delta = Number(change(field))
        expect(Number.isFinite(delta)).toBe(true)
        contract[field] += delta
      }
    }
    if (binaryUpdate.pool) contract.pool = binaryUpdate.pool
    if (typeof binaryUpdate.p === 'number') contract.p = binaryUpdate.p
    return contract
  })
  jest.mocked(runTxnInBetQueue).mockImplementation(async (_pg, payment) => {
    payments.push(payment)
    return {} as Awaited<ReturnType<typeof runTxnInBetQueue>>
  })
  jest.mocked(insertLiquidity).mockImplementation(async (_pg, provision) => {
    const saved = { ...provision, id: `returned-${inserted.length}` }
    inserted.push(saved)
    liquidities.push(saved)
    return row(saved)
  })
})

it.each([300, 1100])(
  'conserves every provider payout in both outcomes through the actual handler (%s)',
  async (amount) => {
    const before = { YES: payouts('YES'), NO: payouts('NO') }
    const initialTotal = contract.totalLiquidity
    const response = await invoke(amount)
    expect(response.result.userId).toBe('alice')
    expect(response.result.amount).toBeCloseTo(-amount / 6, 10)
    expect(inserted.map((provision) => provision.userId).sort()).toEqual([
      'alice',
      'bob',
      'carol',
    ])
    expect(payments).toHaveLength(3)
    expect(
      payments.reduce((total, payment) => total + payment.amount, 0)
    ).toBeCloseTo(amount, 10)
    for (const provision of inserted) {
      expect(payments).toContainEqual({
        fromType: 'CONTRACT',
        fromId: 'market',
        toType: 'USER',
        toId: provision.userId,
        amount: -provision.amount,
        category: 'REMOVE_SUBSIDY',
        token: 'M$',
      })
      expect(provision.withdrawnBy).toBe(
        provision.userId === 'alice' ? undefined : 'alice'
      )
      for (const outcome of ['YES', 'NO'] as const) {
        expect(
          payouts(outcome)[provision.userId] - provision.amount
        ).toBeCloseTo(before[outcome][provision.userId], 8)
      }
    }
    expect(contract.totalLiquidity).toBe(initialTotal - amount)
    expect(contract.subsidyPool).toBe(amount === 300 ? 100 : 0)
    expect(contract.pool).toEqual(
      amount === 300 ? { YES: 900, NO: 2100 } : { YES: 200, NO: 1400 }
    )
    expect(broadcastNewSubsidy).not.toHaveBeenCalled()
    expect(createLiquidityReturnedNotifications).not.toHaveBeenCalled()
    await response.continue?.()
    expect(broadcastNewSubsidy).toHaveBeenCalledWith(
      'market',
      'public',
      -amount
    )
    expect(createLiquidityReturnedNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'market' }),
      expect.objectContaining({ id: 'alice' }),
      inserted.filter((provision) => provision.userId !== 'alice')
    )
  }
)

it('preserves outcome payouts over repeated withdrawals, excluding zero/negative contributors', async () => {
  contract.pool = { YES: 4900, NO: 6100 }
  const before = { YES: payouts('YES'), NO: payouts('NO') }
  for (let i = 0; i < 4; i++) await invoke(600)
  for (const userId of ['alice', 'bob', 'carol']) {
    const paid = payments
      .filter((payment) => payment.toId === userId)
      .reduce((total, payment) => total + payment.amount, 0)
    for (const outcome of ['YES', 'NO'] as const)
      expect(payouts(outcome)[userId] + paid).toBeCloseTo(
        before[outcome][userId],
        8
      )
  }
  expect(payments).toHaveLength(12)
  expect(
    payments.every(
      (payment) => Number.isFinite(payment.amount) && payment.amount > 0
    )
  ).toBe(true)
})

it.each([HOUSE_LIQUIDITY_PROVIDER_ID, DEV_HOUSE_LIQUIDITY_PROVIDER_ID])(
  'pays CASH providers and returns only the house caller provision (%s)',
  async (houseId) => {
    contract.token = 'CASH'
    liquidities = [lp('bob', 900, 'b'), lp(houseId, 100, 'h')]
    jest.mocked(getUser).mockResolvedValue({ id: houseId } as User)
    const { result } = await invoke(200, houseId)
    expect(result).toMatchObject({ userId: houseId, amount: -20 })
    expect(result.withdrawnBy).toBeUndefined()
    expect(
      payments.map(({ toId, amount, token }) => ({ toId, amount, token }))
    ).toEqual([
      { toId: 'bob', amount: 180, token: 'CASH' },
      { toId: houseId, amount: 20, token: 'CASH' },
    ])
    expect(inserted[0]).toMatchObject({
      userId: 'bob',
      amount: -180,
      withdrawnBy: houseId,
    })
  }
)

it.each([
  'resolved',
  'deleted',
  'other mechanism',
  'non-creator',
  'cash creator',
  'zero caller',
  'negative caller',
  'whole contribution',
  'above contribution',
  'pool floor',
])('rejects %s without recording a payment or provision', async (scenario) => {
  let uid = 'alice'
  let amount = 300
  if (scenario === 'resolved') contract.isResolved = true
  if (scenario === 'deleted') contract.deleted = true
  if (scenario === 'other mechanism')
    Object.assign(contract, { mechanism: 'cpmm-multi-2' })
  if (scenario === 'non-creator') uid = 'bob'
  if (scenario === 'cash creator') contract.token = 'CASH'
  if (scenario === 'zero caller') liquidities.push(lp('alice', -1000, 'aw'))
  if (scenario === 'negative caller') liquidities.push(lp('alice', -1100, 'aw'))
  if (scenario === 'whole contribution') amount = 6000
  if (scenario === 'above contribution') amount = 6001
  if (scenario === 'pool floor') amount = 1201
  await expect(invoke(amount, uid)).rejects.toMatchObject({ code: 403 })
  expect(payments).toHaveLength(0)
  expect(inserted).toHaveLength(0)
  expect(updateContract).not.toHaveBeenCalled()
  expect(createLiquidityReturnedNotifications).not.toHaveBeenCalled()
})
