import { betsQueue } from 'shared/helpers/fn-queue'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'
import { internalMembershipBroadcast } from './internal-membership-broadcast'

const mockReadUser = jest.fn()
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: () => ({ oneOrNone: mockReadUser }),
}))
jest.mock('shared/utils', () => ({ log: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedUser: jest.fn(),
}))

const send = internalMembershipBroadcast as (
  body: Parameters<typeof internalMembershipBroadcast>[0]
) => ReturnType<typeof internalMembershipBroadcast>
const previousSecret = process.env.API_SECRET
const userId = 'member'

afterEach(() => {
  if (previousSecret === undefined) delete process.env.API_SECRET
  else process.env.API_SECRET = previousSecret
  jest.clearAllMocks()
})

it('rejects missing or invalid service credentials before reading user state', async () => {
  delete process.env.API_SECRET
  await expect(send({ apiSecret: 'test', userId })).rejects.toMatchObject({
    code: 500,
  })
  process.env.API_SECRET = 'test-secret'
  for (const apiSecret of ['wrong', 'test-secrex']) {
    await expect(send({ apiSecret, userId })).rejects.toMatchObject({
      code: 403,
    })
  }
  expect(mockReadUser).not.toHaveBeenCalled()
  expect(broadcastUpdatedUser).not.toHaveBeenCalled()
})

it('reads and broadcasts the committed state after an earlier checkout releases the user slot', async () => {
  process.env.API_SECRET = 'test-secret'
  let finishCheckout!: () => void
  const checkout = betsQueue.enqueueFn(
    () =>
      new Promise<void>((resolve) => {
        finishCheckout = resolve
      }),
    [userId]
  )
  const relay = send({ apiSecret: 'test-secret', userId })
  try {
    expect(mockReadUser).not.toHaveBeenCalled()
    expect(broadcastUpdatedUser).not.toHaveBeenCalled()
    mockReadUser.mockResolvedValueOnce({
      id: userId,
      balance: 94900,
      cash_balance: 10,
      spice_balance: 12,
      total_deposits: 99000,
      total_cash_deposits: 25,
      entitlements: [
        {
          user_id: userId,
          entitlement_id: 'supporter-basic',
          enabled: true,
          auto_renew: true,
          granted_time: '2026-11-24T00:00:00Z',
        },
      ],
    })
  } finally {
    finishCheckout()
  }
  await checkout
  await expect(relay).resolves.toEqual({ success: true })
  expect(mockReadUser).toHaveBeenCalledWith(expect.any(String), [userId])
  expect(broadcastUpdatedUser).toHaveBeenCalledTimes(1)
  expect(broadcastUpdatedUser).toHaveBeenCalledWith({
    id: userId,
    balance: 94900,
    cashBalance: 10,
    spiceBalance: 12,
    totalDeposits: 99000,
    totalCashDeposits: 25,
    entitlements: [
      expect.objectContaining({
        userId,
        entitlementId: 'supporter-basic',
        autoRenew: true,
      }),
    ],
  })
})
