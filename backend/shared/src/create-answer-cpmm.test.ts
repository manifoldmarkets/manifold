const quietLog = () =>
  Object.assign(jest.fn(), {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })
jest.mock('shared/monitoring/log', () => ({ log: quietLog() }))
jest.mock('shared/utils', () => ({
  LOCAL_ONLY: true,
  log: quietLog(),
  getContractSupabase: jest.fn(),
  getUser: jest.fn(),
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: {},
}))
jest.mock('shared/helpers/fn-queue', () => ({
  betsQueue: { enqueueFn: (fn: () => unknown) => fn() },
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('api/follow-contract', () => ({ followContractInternal: jest.fn() }))
jest.mock('api/redeem-shares', () => ({
  redeemShares: jest.fn(async () => ({
    betsToInsert: [],
    updatedMetrics: [],
    balanceUpdates: [],
  })),
}))
jest.mock('shared/create-notification', () => ({
  createNewAnswerOnContractNotification: jest.fn(),
}))
jest.mock('shared/helpers/user-contract-metrics', () => ({
  bulkUpdateContractMetricsQuery: jest.fn(() => 'select 1'),
  getContractMetrics: jest.fn(async () => []),
}))
jest.mock('shared/supabase/answers', () => ({
  getAnswersForContract: jest.fn(),
  insertAnswer: jest.fn(),
  updateAnswer: jest.fn(),
  updateAnswers: jest.fn(),
}))
jest.mock('shared/supabase/bets', () => ({
  insertBet: jest.fn(),
  bulkInsertBets: jest.fn(async () => ({
    updatedMetrics: [],
    insertedBets: [],
  })),
  bulkInsertBetsQuery: jest.fn(() => 'select 1'),
  cancelLimitOrders: jest.fn(),
}))
jest.mock('api/helpers/bets', () => ({
  getUnfilledBets: jest.fn(),
  getUnfilledBetsAndUserBalances: jest.fn(),
  updateMakers: jest.fn(),
}))
jest.mock('shared/supabase/contracts', () => ({
  updateContract: jest.fn(async () => ({
    id: 'c1',
    visibility: 'public',
    totalLiquidity: 1500,
  })),
}))
jest.mock('shared/supabase/liquidity', () => ({ insertLiquidity: jest.fn() }))
jest.mock('shared/supabase/users', () => ({
  incrementBalance: jest.fn(
    async (
      _pg: unknown,
      id: string,
      deltas: { balance?: number; totalDeposits?: number }
    ) => ({
      id,
      balance: 1e6 + (deltas.balance ?? 0),
      totalDeposits: 1e6 + (deltas.totalDeposits ?? 0),
    })
  ),
  broadcastUserUpdates: jest.fn(),
  bulkIncrementBalancesQuery: jest.fn(() => 'select 1'),
}))
jest.mock('shared/websockets/helpers', () => ({
  broadcastNewAnswer: jest.fn(),
  broadcastOrders: jest.fn(),
  broadcastUpdatedAnswers: jest.fn(),
  broadcastUpdatedContract: jest.fn(),
  broadcastUpdatedMetrics: jest.fn(),
  broadcastUpdatedUser: jest.fn(),
}))

import { Request } from 'express'
import { Answer } from 'common/answer'
import { Bet, LimitBet } from 'common/bet'
import { CPMMMultiContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { User } from 'common/user'
import { AuthedUser } from 'api/helpers/endpoint'
import { createAnswerCPMM } from 'api/create-answer-cpmm'
import { getUnfilledBets } from 'api/helpers/bets'
import { redeemShares } from 'api/redeem-shares'
import {
  getAnswersForContract,
  insertAnswer,
  updateAnswer,
  updateAnswers,
} from 'shared/supabase/answers'
import { cancelLimitOrders } from 'shared/supabase/bets'
import { updateContract } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { broadcastUserUpdates, incrementBalance } from 'shared/supabase/users'
import { getContractSupabase, getUser } from 'shared/utils'
import {
  broadcastNewAnswer,
  broadcastOrders,
  broadcastUpdatedAnswers,
  broadcastUpdatedContract,
  broadcastUpdatedMetrics,
  broadcastUpdatedUser,
} from 'shared/websockets/helpers'

const mocked = <T extends (...args: any[]) => any>(fn: T) =>
  fn as unknown as jest.MockedFunction<T>

const callOrder = (fn: (...args: any[]) => any) =>
  mocked(fn).mock.invocationCallOrder

const answer = (
  id: string,
  index: number,
  poolYes: number,
  poolNo: number,
  isOther = false
): Answer => ({
  id,
  index,
  contractId: 'c1',
  userId: 'creator',
  text: id,
  createdTime: 0,
  poolYes,
  poolNo,
  p: 0.5,
  prob: poolNo / (poolYes + poolNo),
  totalLiquidity: Math.min(poolYes, poolNo),
  subsidyPool: 0,
  volume: 0,
  isOther,
  probChanges: { day: 0, week: 0, month: 0 },
})

const order = (
  id: string,
  answerId: string,
  outcome: 'YES' | 'NO',
  limitProb: number
) =>
  ({
    id,
    contractId: 'c1',
    userId: 'maker',
    answerId,
    outcome,
    limitProb,
    isFilled: false,
    isCancelled: false,
  } as LimitBet)

const user = { id: 'u1', balance: 1e6 } as User
const auth = { uid: 'u1' } as AuthedUser
const req = {} as Request

// Other at 1%, so every listed answer gives some of its price to the new
// answer (addAnswerToCpmmMulti2Pools).
const initialAnswers = () => [
  answer('a', 0, 100, 1900),
  answer('b', 1, 1900, 100),
  answer('other', 2, 1980, 20, true),
]

let answers: Answer[]
let unfilledBets: LimitBet[]
let commitsToFail: number
// How many websocket messages had gone out when each attempt reached commit.
let broadcastsAtCommit: number[]
const trans = {
  one: jest.fn(async () => ({ mechanism: 'cpmm-multi-2' })),
  map: jest.fn(async () => []),
  none: jest.fn(),
  multi: jest.fn(async (): Promise<unknown[][]> => [[], [], [], []]),
}

// Every websocket message the handler can send, so broadcastsAtCommit counts
// balance, metric and contract updates as well as answer and order ones.
const broadcastCount = () =>
  mocked(broadcastNewAnswer).mock.calls.length +
  mocked(broadcastUpdatedAnswers).mock.calls.length +
  mocked(broadcastOrders).mock.calls.length +
  mocked(broadcastUpdatedUser).mock.calls.length +
  mocked(broadcastUserUpdates).mock.calls.length +
  mocked(broadcastUpdatedMetrics).mock.calls.length +
  mocked(broadcastUpdatedContract).mock.calls.length

beforeEach(() => {
  jest.clearAllMocks()
  answers = initialAnswers()
  unfilledBets = []
  commitsToFail = 0
  broadcastsAtCommit = []

  const contract = {
    id: 'c1',
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    token: 'MANA',
    visibility: 'public',
    creatorId: 'creator',
    addAnswersMode: 'ANYONE',
    shouldAnswersSumToOne: true,
    totalLiquidity: 1000,
    answers: initialAnswers(),
  } as unknown as CPMMMultiContract
  mocked(getContractSupabase).mockResolvedValue(contract)
  mocked(getUser).mockResolvedValue(user)

  mocked(createSupabaseDirectClient).mockReturnValue({
    tx: async (_opts: unknown, fn: (t: typeof trans) => Promise<unknown>) => {
      const before = answers.map((a) => ({ ...a }))
      const result = await fn(trans)
      broadcastsAtCommit.push(broadcastCount())
      if (commitsToFail > 0) {
        commitsToFail--
        answers = before // rolled back
        throw Object.assign(
          new Error('could not serialize access due to concurrent update'),
          { code: '40001' }
        )
      }
      return result
    },
  } as any)

  // Fresh objects each read, as rows from the database are.
  mocked(getAnswersForContract).mockImplementation(async () =>
    answers.map((a) => ({ ...a })).sort((a, b) => a.index - b.index)
  )
  mocked(insertAnswer).mockImplementation(async (_pg, ans) => {
    const inserted = { ...ans } as Answer
    answers.push(inserted)
    return inserted
  })
  mocked(updateAnswer).mockImplementation(async (_pg, id, data) => {
    const a = answers.find((a) => a.id === id)!
    Object.assign(a, data)
    return { ...a }
  })
  mocked(updateAnswers).mockImplementation(async (_pg, _cid, updates) => {
    for (const u of updates)
      Object.assign(answers.find((a) => a.id === u.id)!, u)
  })
  mocked(getUnfilledBets).mockImplementation(async () => unfilledBets)
  mocked(cancelLimitOrders).mockImplementation(async (_pg, orders) =>
    orders.map((o) => ({ ...o, isCancelled: true }))
  )
})

const createAnswer = async () => {
  const response = await createAnswerCPMM(
    { contractId: 'c1', text: 'New answer' },
    auth,
    req
  )
  if (!('result' in response)) throw new Error('expected a result')
  return response.result
}

describe('createAnswerCPMM', () => {
  it('announces one answer, after the transaction commits, when an attempt fails to serialize', async () => {
    commitsToFail = 1
    unfilledBets = [order('o1', 'other', 'YES', 0.5)]

    const { newAnswerId } = await createAnswer()

    // Both attempts wrote the same answer, and nothing went out until commit.
    expect(insertAnswer).toHaveBeenCalledTimes(2)
    for (const [, inserted, options] of mocked(insertAnswer).mock.calls) {
      expect((inserted as Answer).id).toBe(newAnswerId)
      expect(options).toEqual({ broadcast: false })
    }
    for (const call of mocked(updateAnswers).mock.calls) {
      expect(call[3]).toEqual({ broadcast: false })
    }
    for (const call of mocked(updateAnswer).mock.calls) {
      expect(call[3]).toEqual({ broadcast: false })
    }
    for (const call of mocked(cancelLimitOrders).mock.calls) {
      expect(call[2]).toEqual({ broadcast: false })
    }
    expect(incrementBalance).toHaveBeenCalledTimes(2)
    for (const call of mocked(incrementBalance).mock.calls) {
      expect(call[3]).toEqual({ broadcast: false })
    }
    expect(updateContract).toHaveBeenCalledTimes(2)
    for (const call of mocked(updateContract).mock.calls) {
      expect(call[3]).toEqual({ broadcast: false })
    }
    expect(broadcastsAtCommit).toEqual([0, 0])

    // The committed state is announced once, in the order it was written.
    expect(broadcastNewAnswer).toHaveBeenCalledTimes(1)
    expect(mocked(broadcastNewAnswer).mock.calls[0][0].id).toBe(newAnswerId)
    expect(broadcastUpdatedAnswers).toHaveBeenCalledTimes(2)
    const [poolUpdates, otherUpdate] = mocked(broadcastUpdatedAnswers).mock
      .calls
    expect(poolUpdates[0]).toBe('c1')
    expect(poolUpdates[1].map((u) => u.id).sort()).toEqual(['a', 'b', 'other'])
    expect(otherUpdate[1]).toEqual([
      expect.objectContaining({ id: 'other', index: 3 }),
    ])
    expect(broadcastOrders).toHaveBeenCalledTimes(1)
    expect(broadcastOrders).toHaveBeenCalledWith([
      { ...unfilledBets[0], isCancelled: true },
    ])

    // The creator's balance and the contract's liquidity are the committed
    // attempt's, sent around the answer messages.
    expect(broadcastUpdatedUser).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedUser).toHaveBeenCalledWith(
      await mocked(incrementBalance).mock.results[1].value
    )
    expect(broadcastUpdatedContract).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedContract).toHaveBeenCalledWith('public', {
      id: 'c1',
      totalLiquidity: 1500,
    })
    expect(callOrder(broadcastUpdatedUser)[0]).toBeLessThan(
      callOrder(broadcastNewAnswer)[0]
    )
    expect(callOrder(broadcastNewAnswer)[0]).toBeLessThan(
      callOrder(broadcastUpdatedAnswers)[0]
    )
    expect(callOrder(broadcastUpdatedAnswers)[1]).toBeLessThan(
      callOrder(broadcastOrders)[0]
    )
    expect(callOrder(broadcastOrders)[0]).toBeLessThan(
      callOrder(broadcastUpdatedContract)[0]
    )

    expect(answers.filter((a) => a.id === newAnswerId)).toHaveLength(1)
    expect(answers).toHaveLength(4)
  })

  it('announces nothing when every attempt fails to serialize', async () => {
    commitsToFail = 3
    unfilledBets = [order('o1', 'other', 'YES', 0.5)]

    await expect(createAnswer()).rejects.toMatchObject({ code: '40001' })

    expect(insertAnswer).toHaveBeenCalledTimes(3)
    const ids = mocked(insertAnswer).mock.calls.map(([, a]) => (a as Answer).id)
    expect(new Set(ids).size).toBe(1)
    expect(broadcastsAtCommit).toEqual([0, 0, 0])
    expect(broadcastCount()).toBe(0)
    expect(answers).toHaveLength(3)
  })

  it("announces the Other holders' redeemed positions after commit", async () => {
    commitsToFail = 1
    const metric = {
      userId: 'holder',
      contractId: 'c1',
      answerId: 'a',
    } as ContractMetric
    const holder = {
      id: 'holder',
      balance: 110,
      cash_balance: 0,
      spice_balance: 0,
      total_deposits: 0,
      total_cash_deposits: 0,
    }
    // Both attempts redeem a holder's refined position.
    for (let attempt = 0; attempt < 2; attempt++) {
      mocked(redeemShares).mockResolvedValueOnce({
        betsToInsert: [
          {
            id: 'r1',
            userId: 'holder',
            contractId: 'c1',
            answerId: 'a',
          } as Bet,
        ],
        updatedMetrics: [metric],
        balanceUpdates: [{ id: 'holder', balance: 10 }],
      } as Awaited<ReturnType<typeof redeemShares>>)
      trans.multi.mockResolvedValueOnce([[], [], [holder], []])
    }

    await createAnswer()

    expect(broadcastsAtCommit).toEqual([0, 0])
    expect(broadcastUserUpdates).toHaveBeenCalledTimes(1)
    expect(broadcastUserUpdates).toHaveBeenCalledWith([holder])
    expect(broadcastUpdatedMetrics).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedMetrics).toHaveBeenCalledWith([metric])
    // After the answer the positions refer to, before the contract's liquidity.
    expect(callOrder(broadcastNewAnswer)[0]).toBeLessThan(
      callOrder(broadcastUserUpdates)[0]
    )
    expect(callOrder(broadcastUpdatedMetrics)[0]).toBeLessThan(
      callOrder(broadcastUpdatedContract)[0]
    )
  })

  it('reads the order book once and cancels the orders the new prices have passed', async () => {
    unfilledBets = [
      order('otherYes', 'other', 'YES', 0.001),
      order('otherNo', 'other', 'NO', 0.999),
      order('aYesHigh', 'a', 'YES', 0.999),
      order('aYesLow', 'a', 'YES', 0.001),
      order('aNo', 'a', 'NO', 0.999),
      order('bYesHigh', 'b', 'YES', 0.999),
      order('bYesLow', 'b', 'YES', 0.001),
    ]

    await createAnswer()

    expect(getUnfilledBets).toHaveBeenCalledTimes(1)
    expect(getUnfilledBets).toHaveBeenCalledWith(trans, 'c1')

    // Both listed answers gave price, so the test covers the per-answer filter.
    const [, poolUpdates] = mocked(broadcastUpdatedAnswers).mock.calls[0]
    for (const id of ['a', 'b']) {
      const before = initialAnswers().find((a) => a.id === id)!.prob
      expect(poolUpdates.find((u) => u.id === id)!.prob).toBeLessThan(before)
    }

    expect(cancelLimitOrders).toHaveBeenCalledTimes(1)
    const cancelled = mocked(cancelLimitOrders).mock.calls[0][1]
    expect(cancelled.map((o) => o.id).sort()).toEqual(
      ['aYesHigh', 'bYesHigh', 'otherNo', 'otherYes'].sort()
    )
    expect(broadcastOrders).toHaveBeenCalledWith(
      cancelled.map((o) => ({ ...o, isCancelled: true }))
    )
  })
})
