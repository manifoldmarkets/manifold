jest.mock('../websockets/helpers', () => ({
  broadcastNewAnswer: jest.fn(),
  broadcastUpdatedAnswers: jest.fn(),
  broadcastOrders: jest.fn(),
  broadcastUpdatedContract: jest.fn(),
  broadcastUpdatedUser: jest.fn(),
}))
// Pulled in by ./contracts at import time; unused by the writes under test.
jest.mock('shared/helpers/openai-utils', () => ({}))
jest.mock('shared/helpers/prompt-ai', () => ({}))

import { LimitBet } from 'common/bet'
import { Row } from 'common/supabase/utils'
import { SupabaseDirectClient } from './init'
import { insertAnswer, updateAnswer, updateAnswers } from './answers'
import { cancelLimitOrders } from './bets'
import { updateContract } from './contracts'
import { incrementBalance } from './users'
import {
  broadcastNewAnswer,
  broadcastOrders,
  broadcastUpdatedAnswers,
  broadcastUpdatedContract,
  broadcastUpdatedUser,
} from '../websockets/helpers'

const row = {
  id: 'ans',
  index: 0,
  contract_id: 'c1',
  user_id: 'u1',
  text: 'Answer',
  created_time: '2026-10-04T00:00:00Z',
  pool_yes: 10,
  pool_no: 10,
  p: 0.5,
  prob: 0.5,
  total_liquidity: 10,
  subsidy_pool: 0,
  is_other: false,
} as unknown as Row<'answers'>

const answer = {
  index: 0,
  contractId: 'c1',
  userId: 'u1',
  text: 'Answer',
  createdTime: 0,
  poolYes: 10,
  poolNo: 10,
  p: 0.5,
  prob: 0.5,
  totalLiquidity: 10,
  subsidyPool: 0,
  volume: 0,
  isOther: false,
  probChanges: { day: 0, week: 0, month: 0 },
}

const order = {
  id: 'bet1',
  contractId: 'c1',
  userId: 'u1',
  answerId: 'ans',
  outcome: 'YES',
  limitProb: 0.6,
  isCancelled: false,
  isFilled: false,
} as LimitBet

let pg: SupabaseDirectClient

beforeEach(() => {
  jest.clearAllMocks()
  pg = {
    one: jest.fn(async () => row),
    none: jest.fn(async () => undefined),
  } as unknown as SupabaseDirectClient
})

describe('answer writes', () => {
  it('broadcast by default', async () => {
    const inserted = await insertAnswer(pg, answer)
    expect(inserted.id).toBe('ans')
    expect(broadcastNewAnswer).toHaveBeenCalledWith(inserted)

    await updateAnswer(pg, 'ans', { index: 1 })
    expect(broadcastUpdatedAnswers).toHaveBeenCalledWith('c1', [inserted])

    await updateAnswers(pg, 'c1', [{ id: 'ans', prob: 0.4 }])
    expect(broadcastUpdatedAnswers).toHaveBeenLastCalledWith('c1', [
      { id: 'ans', prob: 0.4 },
    ])
  })

  it('return what they would have broadcast when asked not to', async () => {
    const inserted = await insertAnswer(pg, answer, { broadcast: false })
    expect(inserted.id).toBe('ans')
    expect(pg.one).toHaveBeenCalledTimes(1)

    const updated = await updateAnswer(
      pg,
      'ans',
      { index: 1 },
      { broadcast: false }
    )
    expect(updated.id).toBe('ans')
    expect(pg.one).toHaveBeenCalledTimes(2)

    await updateAnswers(pg, 'c1', [{ id: 'ans', prob: 0.4 }], {
      broadcast: false,
    })
    expect(pg.none).toHaveBeenCalledTimes(1)

    expect(broadcastNewAnswer).not.toHaveBeenCalled()
    expect(broadcastUpdatedAnswers).not.toHaveBeenCalled()
  })
})

describe('cancelLimitOrders', () => {
  it('broadcasts the cancelled orders by default', async () => {
    const cancelled = await cancelLimitOrders(pg, [order])
    expect(cancelled).toEqual([{ ...order, isCancelled: true }])
    expect(pg.none).toHaveBeenCalledTimes(1)
    expect(broadcastOrders).toHaveBeenCalledWith(cancelled)
  })

  it('returns them without broadcasting when asked not to', async () => {
    const cancelled = await cancelLimitOrders(pg, [order], { broadcast: false })
    expect(cancelled).toEqual([{ ...order, isCancelled: true }])
    expect(pg.none).toHaveBeenCalledTimes(1)
    expect(broadcastOrders).not.toHaveBeenCalled()
  })

  it('does nothing for no orders', async () => {
    expect(await cancelLimitOrders(pg, [])).toEqual([])
    expect(pg.none).not.toHaveBeenCalled()
    expect(broadcastOrders).not.toHaveBeenCalled()
  })
})

describe('balance and contract writes', () => {
  const userRow = { id: 'u1', balance: 90, total_deposits: 40 }
  const contractRow = {
    data: { id: 'c1', visibility: 'public', totalLiquidity: 1100 },
    importance_score: 0,
    view_count: 0,
    token: 'MANA',
  } as unknown as Row<'contracts'>
  const clientReturning = (row: unknown) =>
    ({ one: jest.fn(async () => row) } as unknown as SupabaseDirectClient)

  it('broadcast by default', async () => {
    const users = clientReturning(userRow)
    const userUpdate = await incrementBalance(users, 'u1', {
      balance: -10,
      totalDeposits: -10,
    })
    expect(userUpdate).toEqual({ id: 'u1', balance: 90, totalDeposits: 40 })
    expect(broadcastUpdatedUser).toHaveBeenCalledWith(userUpdate)

    const contracts = clientReturning(contractRow)
    const contract = await updateContract(contracts, 'c1', {
      totalLiquidity: 1100,
    })
    expect(contract).toMatchObject({ id: 'c1', totalLiquidity: 1100 })
    expect(broadcastUpdatedContract).toHaveBeenCalledWith('public', {
      id: 'c1',
      totalLiquidity: 1100,
    })
  })

  it('return the row without broadcasting when asked not to', async () => {
    const users = clientReturning(userRow)
    const userUpdate = await incrementBalance(
      users,
      'u1',
      { balance: -10, totalDeposits: -10 },
      { broadcast: false }
    )
    expect(userUpdate).toEqual({ id: 'u1', balance: 90, totalDeposits: 40 })
    expect(users.one).toHaveBeenCalledTimes(1)

    const contracts = clientReturning(contractRow)
    const contract = await updateContract(
      contracts,
      'c1',
      { totalLiquidity: 1100 },
      { broadcast: false }
    )
    expect(contract).toMatchObject({ id: 'c1', totalLiquidity: 1100 })
    expect(contracts.one).toHaveBeenCalledTimes(1)

    expect(broadcastUpdatedUser).not.toHaveBeenCalled()
    expect(broadcastUpdatedContract).not.toHaveBeenCalled()
  })

  it('incrementBalance writes and returns nothing for no change', async () => {
    const users = clientReturning(userRow)
    expect(await incrementBalance(users, 'u1', { balance: 0 })).toBeUndefined()
    expect(users.one).not.toHaveBeenCalled()
    expect(broadcastUpdatedUser).not.toHaveBeenCalled()
  })
})
