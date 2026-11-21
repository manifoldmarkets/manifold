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
jest.mock('shared/supabase/contracts', () => ({ updateContract: jest.fn() }))
jest.mock('shared/supabase/liquidity', () => ({ insertLiquidity: jest.fn() }))
jest.mock('shared/supabase/users', () => ({
  incrementBalance: jest.fn(),
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
import {
  getUnfilledBets,
  getUnfilledBetsAndUserBalances,
  updateMakers,
} from 'api/helpers/bets'
import { redeemShares } from 'api/redeem-shares'
import {
  getAnswersForContract,
  insertAnswer,
  updateAnswer,
  updateAnswers,
} from 'shared/supabase/answers'
import { cancelLimitOrders, insertBet } from 'shared/supabase/bets'
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
// The options each attempt's transaction was opened with.
let txOptions: unknown[]
// Results for the multi-statement writes, in order. The row-lock batch each
// attempt opens with is answered without taking one.
let multiWriteResults: unknown[][][]
// The contract row each attempt reads under its lock.
type LockedContract = {
  mechanism: string
  resolved?: boolean
  closeTime?: number | null
}
const trans = {
  one: jest.fn(
    async (): Promise<LockedContract> => ({ mechanism: 'cpmm-multi-2' })
  ),
  map: jest.fn(async () => []),
  none: jest.fn(),
  multi: jest.fn(
    async (sql: string): Promise<unknown[][]> =>
      (/for update/.test(sql) ? undefined : multiWriteResults.shift()) ?? [
        [],
        [],
        [],
        [],
      ]
  ),
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
  txOptions = []
  multiWriteResults = []

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
    tx: async (opts: unknown, fn: (t: typeof trans) => Promise<unknown>) => {
      txOptions.push(opts)
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

  // The rows a database returns differ between attempts (the retry reads
  // state another transaction changed), so a handler that broadcast a failed
  // attempt's row could not pass by coincidence.
  let balanceWrites = 0
  mocked(incrementBalance).mockImplementation(async (_pg, id, deltas) => ({
    id,
    balance: 1e6 - 1000 * ++balanceWrites + (deltas.balance ?? 0),
    totalDeposits: 1e6 + (deltas.totalDeposits ?? 0),
  }))
  let liquidityWrites = 0
  mocked(updateContract).mockImplementation(
    async () =>
      ({
        id: 'c1',
        visibility: 'public',
        totalLiquidity: 1000 + 100 * ++liquidityWrites,
      } as unknown as Awaited<ReturnType<typeof updateContract>>)
  )
})

const committedResult = async <T>(fn: (...args: any[]) => Promise<T>) => {
  const results = mocked(fn).mock.results.map((r) => r.value as Promise<T>)
  const values = await Promise.all(results)
  expect(values[values.length - 1]).not.toEqual(values[0])
  return values[values.length - 1]
}

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
    // (second) attempt's rows, not the rolled-back attempt's, sent around the
    // answer messages.
    expect(broadcastUpdatedUser).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedUser).toHaveBeenCalledWith(
      await committedResult(incrementBalance)
    )
    const committedContract = (await committedResult(
      updateContract
    )) as CPMMMultiContract
    expect(broadcastUpdatedContract).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedContract).toHaveBeenCalledWith('public', {
      id: 'c1',
      totalLiquidity: committedContract.totalLiquidity,
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

  // What convertOtherAnswerShares' redemption of a holder's refined position
  // writes, as the handler sees it: redeemShares' result and the balance rows
  // the combined insert/metrics/balance query returns.
  const redeems = (holder: string) => {
    mocked(redeemShares).mockResolvedValueOnce({
      betsToInsert: [
        { id: 'r-' + holder, userId: holder, contractId: 'c1', answerId: 'a' },
      ] as Bet[],
      updatedMetrics: [
        { userId: holder, contractId: 'c1', answerId: 'a' } as ContractMetric,
      ],
      balanceUpdates: [{ id: holder, balance: 10 }],
    } as Awaited<ReturnType<typeof redeemShares>>)
    multiWriteResults.push([
      [],
      [],
      [{ id: holder, balance: 110, cash_balance: 0, spice_balance: 0 }],
      [],
    ])
  }

  it("announces the Other holders' redeemed positions after commit", async () => {
    commitsToFail = 1
    // The rolled-back attempt redeems one holder, the committed one another.
    redeems('rolledBack')
    redeems('committed')

    await createAnswer()

    expect(broadcastsAtCommit).toEqual([0, 0])
    expect(broadcastUserUpdates).toHaveBeenCalledTimes(1)
    expect(broadcastUserUpdates).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'committed', balance: 110 }),
    ])
    expect(broadcastUpdatedMetrics).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedMetrics).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'committed', answerId: 'a' }),
    ])
    // After the answer the positions refer to, before the contract's liquidity.
    expect(callOrder(broadcastNewAnswer)[0]).toBeLessThan(
      callOrder(broadcastUserUpdates)[0]
    )
    expect(callOrder(broadcastUpdatedMetrics)[0]).toBeLessThan(
      callOrder(broadcastUpdatedContract)[0]
    )
  })

  it("discards a failed attempt's redemptions when the committed attempt has none", async () => {
    commitsToFail = 1
    redeems('rolledBack')
    // The second attempt gets the default: nothing to redeem.

    await createAnswer()

    expect(broadcastsAtCommit).toEqual([0, 0])
    expect(broadcastUserUpdates).toHaveBeenCalledTimes(1)
    expect(broadcastUserUpdates).toHaveBeenCalledWith([])
    expect(broadcastUpdatedMetrics).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedMetrics).toHaveBeenCalledWith([])
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

  it('on cpmm-multi-1, announces Other before the pools and nothing before commit', async () => {
    // The v1 split is live on most sum-to-one markets. Its first Other message
    // is the row as updateAnswer returned it (new index and liquidity, old
    // pools); the pools batch that follows corrects Other, so the client must
    // apply them in that order.
    answers = [
      answer('a', 0, 400, 600),
      answer('b', 1, 700, 300),
      answer('other', 2, 900, 100, true),
    ]
    const before = answers.map((a) => ({ ...a }))
    const current = await getContractSupabase('c1')
    mocked(getContractSupabase).mockResolvedValue({
      ...current,
      mechanism: 'cpmm-multi-1',
      answers: before,
      collectedFees: { creatorFee: 0, platformFee: 0, liquidityFee: 0 },
    } as CPMMMultiContract)
    // One mechanism read per attempt.
    trans.one.mockResolvedValueOnce({ mechanism: 'cpmm-multi-1' })
    trans.one.mockResolvedValueOnce({ mechanism: 'cpmm-multi-1' })
    mocked(getUnfilledBetsAndUserBalances).mockResolvedValue({
      unfilledBets: [],
      balanceByUserId: { u1: 1e6 },
      contractMetrics: [],
    })
    mocked(updateMakers).mockResolvedValue({
      betsToInsert: [],
      updatedMetrics: [],
      balanceUpdates: [],
      updatedMakers: [],
      bulkUpdateLimitOrdersQuery: 'select 1',
    } as Awaited<ReturnType<typeof updateMakers>>)
    mocked(insertBet).mockImplementation(async (bet) => ({
      insertedBet: { bet_id: bet.answerId } as Awaited<
        ReturnType<typeof insertBet>
      >['insertedBet'],
      updatedMetrics: [],
    }))
    commitsToFail = 1

    const { newAnswerId } = await createAnswer()

    expect(broadcastsAtCommit).toEqual([0, 0])
    expect(broadcastNewAnswer).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedAnswers).toHaveBeenCalledTimes(2)
    const [otherRow, pools] = mocked(broadcastUpdatedAnswers).mock.calls
    expect(otherRow[1]).toEqual([
      expect.objectContaining({ id: 'other', index: 3 }),
    ])
    expect(pools[1].map((u) => u.id).sort()).toEqual(
      ['a', 'b', newAnswerId, 'other'].sort()
    )
    expect(broadcastUpdatedUser).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedContract).toHaveBeenCalledTimes(1)

    // Replaying the messages the way the client does lands on the committed
    // rows.
    let client = [...before, mocked(broadcastNewAnswer).mock.calls[0][0]]
    for (const [, updates] of mocked(broadcastUpdatedAnswers).mock.calls) {
      client = client.map((a) => ({
        ...a,
        ...updates.find((u) => u.id === a.id),
      }))
    }
    const byIndex = (a: Answer, b: Answer) => a.index - b.index
    expect(client.sort(byIndex)).toEqual(answers.sort(byIndex))
  })

  it('runs at READ COMMITTED, locking the contract and then every row it overwrites before reading them', async () => {
    // Under SERIALIZABLE, a big market's reads were widened to whole-table
    // locks and any bet on the site aborted the attempt.
    await createAnswer()

    expect(txOptions).toHaveLength(1)
    expect(txOptions[0]).not.toHaveProperty('mode')

    const [lockContractSql, lockContractArgs] = trans.one.mock
      .calls[0] as unknown as [string, unknown[]]
    expect(lockContractSql).toMatch(/from contracts where id = \$1 for update/)
    expect(lockContractArgs).toEqual(['c1'])

    // One batch, returning a row per statement (so not pg-promise's none(),
    // which rejects any returned row).
    const [lockRowsSql, lockRowsArgs] = trans.multi.mock
      .calls[0] as unknown as [string, unknown[]]
    const normalized = lockRowsSql.replace(/\s+/g, ' ')
    for (const lock of [
      /from answers where contract_id = \$1 for update/,
      /from contract_bets where contract_id = \$1 and is_filled = false and is_cancelled = false for update/,
      /from user_contract_metrics where contract_id = \$1 for update/,
      /from users where id = \$2 for update/,
    ])
      expect(normalized).toMatch(lock)
    expect(lockRowsArgs).toEqual(['c1', 'u1'])
    expect(trans.none).not.toHaveBeenCalled()

    const lockContract = trans.one.mock.invocationCallOrder[0]
    const lockRows = trans.multi.mock.invocationCallOrder[0]
    expect(lockContract).toBeLessThan(lockRows)
    expect(lockRows).toBeLessThan(callOrder(getUser)[0])
    expect(lockRows).toBeLessThan(callOrder(getAnswersForContract)[0])
    expect(lockRows).toBeLessThan(callOrder(getUnfilledBets)[0])
    expect(lockRows).toBeLessThan(trans.map.mock.invocationCallOrder[0])
    expect(callOrder(getUser)[0]).toBeLessThan(callOrder(incrementBalance)[0])
  })

  const expectNothingWritten = () => {
    expect(txOptions).toHaveLength(1)
    expect(getUser).not.toHaveBeenCalled()
    expect(incrementBalance).not.toHaveBeenCalled()
    expect(insertAnswer).not.toHaveBeenCalled()
    expect(updateAnswers).not.toHaveBeenCalled()
    expect(updateContract).not.toHaveBeenCalled()
    expect(broadcastCount()).toBe(0)
  }

  it('refuses, writing nothing, when the market resolved while it waited for the lock', async () => {
    trans.one.mockResolvedValueOnce({
      mechanism: 'cpmm-multi-2',
      resolved: true,
      closeTime: null,
    })

    await expect(createAnswer()).rejects.toMatchObject({
      code: 403,
      message: 'This market has already resolved',
    })
    expectNothingWritten()
  })

  it('refuses, writing nothing, when the market closes while it waits for the row locks', async () => {
    // Open when the contract row is read, closed by the time the rest of the
    // locks are held.
    const closeTime = 1_000_000
    let now = closeTime - 1
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now)
    trans.multi.mockImplementationOnce(async () => {
      now = closeTime + 1
      return [[], [], [], []]
    })
    trans.one.mockResolvedValueOnce({
      mechanism: 'cpmm-multi-2',
      resolved: false,
      closeTime,
    })
    mocked(getContractSupabase).mockResolvedValue({
      ...(await getContractSupabase('c1')),
      closeTime,
    } as CPMMMultiContract)

    try {
      await expect(createAnswer()).rejects.toMatchObject({
        code: 403,
        message: 'Trading is closed',
      })
    } finally {
      clock.mockRestore()
    }
    expectNothingWritten()
  })
})
