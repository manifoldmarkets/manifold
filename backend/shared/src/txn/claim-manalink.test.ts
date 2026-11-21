jest.mock('api/helpers/endpoint', () => ({
  APIError:
    jest.requireActual<typeof import('common/api/utils')>('common/api/utils')
      .APIError,
  authEndpoint: <T>(handler: T) => handler,
  validate: (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
}))
jest.mock('api/helpers/rate-limit', () => ({
  getActiveUserBans: jest.fn(async () => []),
}))
jest.mock('common/can-send-mana', () => ({
  canSendMana: () => ({ canSend: true }),
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: { isolationLevel: 3 },
}))
jest.mock('shared/utils', () => ({ getUser: jest.fn() }))
jest.mock('shared/supabase/users', () => ({ broadcastUserUpdates: jest.fn() }))
jest.mock('shared/monitoring/log', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('shared/txn/run-txn', () => ({
  runTxnOutsideBetQueue: jest.fn(),
  runTxnInBetQueue: jest.fn(async () => {
    throw new Error('A claim must not wait in the bet queue')
  }),
}))

import { claimmanalink } from 'api/claim-manalink'
import { APIError } from 'common/api/utils'
import { User } from 'common/user'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { runTxnInBetQueue, runTxnOutsideBetQueue } from './run-txn'
import { broadcastUserUpdates, UserUpdate } from 'shared/supabase/users'

// Exercise the real retry helper and handler. Database scheduling, balances and
// broadcasts require the separate opt-in PostgreSQL regression harness.
const claim = claimmanalink as unknown as (
  req: { body: { slug: string } },
  auth: { uid: string }
) => Promise<{ message: string }>
const redeem = () => claim({ body: { slug: 'test-link' } }, { uid: 'claimant' })
const transfer = jest.mocked(runTxnOutsideBetQueue)
const readLink = jest.fn()
const readClaims = jest.fn()
const insertClaim = jest.fn()
const transactions: SupabaseTransaction[] = []
const transact = jest.fn(
  async (
    _options: { mode?: unknown },
    callback: (tx: SupabaseTransaction) => Promise<unknown>
  ) => {
    const tx = {
      oneOrNone: readLink,
      map: readClaims,
      none: insertClaim,
    } as unknown as SupabaseTransaction
    transactions.push(tx)
    const result = await callback(tx)
    expect(broadcastUserUpdates).not.toHaveBeenCalled()
    return result
  }
)
const deadlock = () =>
  Object.assign(new Error('deadlock detected'), { code: '40P01' })

beforeEach(() => {
  jest.clearAllMocks()
  transfer.mockReset()
  transactions.length = 0
  readLink.mockResolvedValue({
    id: 'test-link',
    creator_id: 'creator',
    amount: 50,
    max_uses: 1,
    expires_time: null,
  })
  readClaims.mockReset().mockResolvedValue([])
  insertClaim.mockReset().mockResolvedValue(undefined)
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    tx: transact,
  } as unknown as ReturnType<typeof createSupabaseDirectClient>)
  jest.mocked(getUser).mockImplementation(async (id, tx) => {
    if (!transactions.includes(tx as SupabaseTransaction)) {
      throw new Error('User read requested an extra pool connection')
    }
    return { id, username: id } as User
  })
  transfer.mockImplementation(async (_tx, _data, _profit, collect) => {
    collect?.([
      { id: 'claimant', balance: transactions.length * 50 } as UserUpdate,
    ])
    return { id: 'transfer' } as Awaited<
      ReturnType<typeof runTxnOutsideBetQueue>
    >
  })
})

it('uses one connection and avoids the bet queue while holding the link lock', async () => {
  await expect(redeem()).resolves.toEqual({ message: 'Manalink claimed' })
  expect(transact).toHaveBeenCalledTimes(1)
  expect(transact.mock.calls[0][0]).toEqual({}) // READ COMMITTED, not SERIALIZABLE
  expect(getUser).toHaveBeenNthCalledWith(1, 'creator', transactions[0])
  expect(getUser).toHaveBeenNthCalledWith(2, 'claimant', transactions[0])
  expect(runTxnInBetQueue).not.toHaveBeenCalled()
  expect(transfer).toHaveBeenCalledWith(
    transactions[0],
    expect.objectContaining({
      fromId: 'creator',
      toId: 'claimant',
      amount: 50,
    }),
    false,
    expect.any(Function)
  )
  expect(insertClaim).toHaveBeenCalledWith(expect.any(String), [
    'transfer',
    'test-link',
  ])
})

it('reacquires the link and recounts claims in a new transaction after a deadlock', async () => {
  transfer.mockRejectedValueOnce(deadlock())
  await expect(redeem()).resolves.toEqual({ message: 'Manalink claimed' })
  expect(transact).toHaveBeenCalledTimes(2)
  expect(transactions[0]).not.toBe(transactions[1])
  expect(readLink).toHaveBeenCalledTimes(2)
  expect(readClaims).toHaveBeenCalledTimes(2)
  expect(insertClaim).toHaveBeenCalledTimes(1)
  expect(getUser).toHaveBeenNthCalledWith(3, 'creator', transactions[1])
  expect(getUser).toHaveBeenNthCalledWith(4, 'claimant', transactions[1])
})

it('rejects a replay committed by another request between retry attempts', async () => {
  transfer.mockRejectedValueOnce(deadlock())
  readClaims.mockResolvedValueOnce([]).mockResolvedValue(['claimant'])
  await expect(redeem()).rejects.toMatchObject({
    code: 403,
    message: expect.stringContaining('already redeemed'),
  })
  expect(transact).toHaveBeenCalledTimes(2)
  expect(transfer).toHaveBeenCalledTimes(1)
  expect(insertClaim).not.toHaveBeenCalled()
})

it('stops after three retryable failures', async () => {
  transfer.mockRejectedValue(deadlock())
  await expect(redeem()).rejects.toMatchObject({ code: '40P01' })
  expect(transact).toHaveBeenCalledTimes(3)
  expect(insertClaim).not.toHaveBeenCalled()
})

it('does not retry insufficient funds or record a claim', async () => {
  transfer.mockRejectedValue(new APIError(403, 'Insufficient balance'))
  await expect(redeem()).rejects.toMatchObject({ code: 403 })
  expect(transact).toHaveBeenCalledTimes(1)
  expect(insertClaim).not.toHaveBeenCalled()
})

it('propagates non-retryable claim-insert failures without running a second transfer', async () => {
  insertClaim.mockRejectedValue(
    Object.assign(new Error('claim insert failed'), { code: '23503' })
  )
  await expect(redeem()).rejects.toMatchObject({ code: '23503' })
  expect(transact).toHaveBeenCalledTimes(1)
  expect(transfer).toHaveBeenCalledTimes(1)
  expect(broadcastUserUpdates).not.toHaveBeenCalled()
})

it('publishes only the committed attempt after a failure following the transfer', async () => {
  insertClaim.mockRejectedValueOnce(deadlock())
  await expect(redeem()).resolves.toEqual({ message: 'Manalink claimed' })
  expect(transact).toHaveBeenCalledTimes(2)
  expect(broadcastUserUpdates).toHaveBeenCalledTimes(1)
  expect(broadcastUserUpdates).toHaveBeenCalledWith([
    { id: 'claimant', balance: 100 },
  ])
})

it('publishes no balances if all attempts fail after the transfer', async () => {
  insertClaim.mockRejectedValue(deadlock())
  await expect(redeem()).rejects.toMatchObject({ code: '40P01' })
  expect(transact).toHaveBeenCalledTimes(3)
  expect(transfer).toHaveBeenCalledTimes(3)
  expect(broadcastUserUpdates).not.toHaveBeenCalled()
})
