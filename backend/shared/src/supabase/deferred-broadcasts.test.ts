jest.mock('../websockets/helpers', () => ({
  broadcastNewAnswer: jest.fn(),
  broadcastUpdatedAnswers: jest.fn(),
  broadcastOrders: jest.fn(),
}))

import { LimitBet } from 'common/bet'
import { Row } from 'common/supabase/utils'
import { SupabaseDirectClient } from './init'
import { insertAnswer, updateAnswer, updateAnswers } from './answers'
import { cancelLimitOrders } from './bets'
import {
  broadcastNewAnswer,
  broadcastOrders,
  broadcastUpdatedAnswers,
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
