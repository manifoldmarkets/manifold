const quietLog = () =>
  Object.assign(jest.fn(), {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })
jest.mock('shared/monitoring/log', () => ({ log: quietLog() }))
jest.mock('shared/utils', () => ({
  log: quietLog(),
  contractColumnsToSelect: '*',
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: {},
  pgp: {},
}))
jest.mock('shared/helpers/fn-queue', () => ({
  betsQueue: { enqueueFn: (fn: () => unknown) => fn() },
  ordersQueue: { enqueueFn: (fn: () => unknown) => fn() },
}))
jest.mock('api/on-create-bet', () => ({ onCreateBets: jest.fn() }))
jest.mock('api/redeem-shares', () => ({
  redeemShares: jest.fn(async () => ({
    betsToInsert: [],
    updatedMetrics: [],
    balanceUpdates: [],
  })),
}))
jest.mock('shared/helpers/user-contract-metrics', () => ({
  bulkUpdateContractMetricsQuery: jest.fn(() => 'select 1'),
  bulkUpdateUserMetricsWithNewBetsOnly: jest.fn(async () => []),
  getContractMetrics: jest.fn(async () => []),
}))
jest.mock('shared/supabase/answers', () => ({
  partialAnswerToRow: jest.fn((answer: unknown) => answer),
}))
jest.mock('shared/supabase/bets', () => ({
  bulkInsertBetsQuery: jest.fn(() => 'select 1'),
  cancelLimitOrdersQuery: jest.fn((orders: unknown[]) => ({
    query: 'select 1',
    bets: orders,
  })),
  insertZeroAmountLimitBet: jest.fn(async (bet: { answerId?: string }) => ({
    bet_id: 'placed',
    data: bet,
    answer_id: bet.answerId ?? null,
    created_time: '2026-11-13T00:00:00.000Z',
    updated_time: '2026-11-13T00:00:00.000Z',
    expires_at: null,
  })),
}))
jest.mock('shared/supabase/users', () => ({
  broadcastUserUpdates: jest.fn(),
  bulkIncrementBalancesQuery: jest.fn(() => 'select 1'),
  incrementStreakQuery: jest.fn(() => 'select 1'),
}))
jest.mock('shared/supabase/utils', () => ({
  bulkUpdateQuery: jest.fn(() => 'select 1'),
  updateDataQuery: jest.fn(() => 'select 1'),
  getInsertQuery: jest.fn(() => 'select 1'),
}))
jest.mock('shared/txn/run-txn', () => ({ txnToRow: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedAnswers: jest.fn(),
  broadcastUpdatedContract: jest.fn(),
}))
jest.mock('api/helpers/bets', () => ({
  ...jest.requireActual('api/helpers/bets'),
  fetchContractBetDataAndValidate: jest.fn(),
  lockContractAndGetBetData: jest.fn(),
  getUserBalancesAndMetrics: jest.fn(),
}))

import {
  fetchContractBetDataAndValidate,
  getUserBalancesAndMetrics,
  lockContractAndGetBetData,
} from 'api/helpers/bets'
import { placeBetMain } from 'api/place-bet'
import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { noFees } from 'common/fees'
import { pick } from 'lodash'
import {
  cancelLimitOrdersQuery,
  insertZeroAmountLimitBet,
} from 'shared/supabase/bets'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const mocked = <T extends (...args: any[]) => any>(fn: T) =>
  fn as unknown as jest.MockedFunction<T>

// What a maker is left with when their balance runs out part-way through a
// fill: the fill is worked out from the balance as a double and taken off the
// exact balance the database keeps.
const SPENT = 6.457834393110897e-15

const answersWith = (pools: number[][]) =>
  pools.map(
    ([poolYes, poolNo], index) =>
      ({
        id: 'answer' + index,
        contractId: 'market',
        userId: 'creator',
        text: 'Answer ' + index,
        createdTime: 0,
        index,
        prob: poolNo / (poolYes + poolNo),
        poolYes,
        poolNo,
        p: 0.5,
        totalLiquidity: 0,
        subsidyPool: 0,
        probChanges: { day: 0, week: 0, month: 0 },
        volume: 0,
      } as Answer)
  )

const restingOrder = (
  id: string,
  answer: Answer,
  outcome: 'YES' | 'NO',
  orderAmount: number,
  limitProb: number
): LimitBet => ({
  id,
  userId: 'maker',
  contractId: 'market',
  answerId: answer.id,
  createdTime: 0,
  amount: 0,
  loanAmount: 0,
  outcome,
  shares: 0,
  probBefore: answer.prob,
  probAfter: answer.prob,
  fees: noFees,
  isRedemption: false,
  orderAmount,
  limitProb,
  isFilled: false,
  isCancelled: false,
  fills: [],
})

// Stands in for the database: the same market, orders and balances for the
// read before the transaction and the reads inside it.
const useMarket = (answers: Answer[], unfilledBets: LimitBet[]) => {
  const contract = {
    id: 'market',
    slug: 'market',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    visibility: 'public',
    token: 'MANA',
    collectedFees: noFees,
    volume: 0,
    uniqueBettorCount: 0,
    answers,
  }
  const balances: Record<string, number> = { taker: 1000, maker: SPENT }
  const makerBalances = { maker: SPENT }
  mocked(fetchContractBetDataAndValidate).mockResolvedValue({
    user: { id: 'taker', username: 'taker', balance: balances.taker },
    contract,
    creator: undefined,
    answers,
    unfilledBets,
    balanceByUserId: makerBalances,
    unfilledBetUserIds: ['maker'],
    contractMetrics: [],
  } as unknown as Awaited<ReturnType<typeof fetchContractBetDataAndValidate>>)
  mocked(lockContractAndGetBetData).mockResolvedValue({
    contract,
    answers,
    unfilledBets,
    balanceByUserId: makerBalances,
    unfilledBetUserIds: ['maker'],
  } as unknown as Awaited<ReturnType<typeof lockContractAndGetBetData>>)
  // Only the users asked for, as the query does.
  mocked(getUserBalancesAndMetrics).mockImplementation(
    async (_pg, userIds) => ({
      balanceByUserId: pick(balances, userIds),
      contractMetrics: [],
    })
  )
  const trans = {
    multi: jest.fn(async () => [
      [],
      [{ streak_incremented: false }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ]),
  }
  mocked(createSupabaseDirectClient).mockReturnValue({
    tx: async (_opts: unknown, fn: (t: typeof trans) => Promise<unknown>) =>
      fn(trans),
  } as unknown as ReturnType<typeof createSupabaseDirectClient>)
  return trans
}

describe('placeBetMain and makers out of balance', () => {
  beforeEach(() => jest.clearAllMocks())

  it('places a limit order at a price where the only order across it cannot be paid for', async () => {
    // Three answers at 50%, 30% and 20%. A maker with nothing to pay with has
    // a NO order resting on the first at 50%, and someone bids YES there at
    // 50%. Nothing can fill. Worked out again in the transaction with that
    // maker taken to have all they need, the bid filled against the order, the
    // two results differed, and the bet was refused however often it was
    // retried.
    const answers = answersWith([
      [100, 100],
      [152.75252316519467, 65.46536707079771],
      [200, 50],
    ])
    useMarket(answers, [restingOrder('at50', answers[0], 'NO', 100, 0.5)])

    const { result } = await placeBetMain(
      {
        contractId: 'market',
        answerId: 'answer0',
        outcome: 'YES',
        amount: 50,
        limitProb: 0.5,
      } as Parameters<typeof placeBetMain>[0],
      'taker',
      false
    )

    expect(result.betId).toBe('placed')
    expect(result.amount).toBe(0)
    expect(mocked(insertZeroAmountLimitBet)).toHaveBeenCalledTimes(1)
    expect(mocked(insertZeroAmountLimitBet).mock.calls[0][0]).toMatchObject({
      userId: 'taker',
      answerId: 'answer0',
      outcome: 'YES',
      amount: 0,
      orderAmount: 50,
      limitProb: 0.5,
      isFilled: false,
    })
    // The second pass asked for the taker's balance alone: no maker matched.
    expect(mocked(getUserBalancesAndMetrics).mock.calls[0][1]).toEqual([
      'taker',
    ])
  })

  it('cancels an order whose maker is out of balance, and makes the bet that reached it', async () => {
    // "Largest company end of 2026?" on 2026-11-13: NVIDIA (the second
    // answer) at 22.02%, with the maker's YES order resting at 22%.
    const answers = answersWith([
      [98.90074594387598, 316.95271553231885],
      [333.9603143435627, 94.32742389434054],
      [2002.4384487669918, 15.66290366066713],
      [7724.6109048255385, 4.052215456471361],
      [4502.377358405622, 6.960862106285278],
      [10891.33997554399, 2.872405655238442],
      [6245.523064829832, 5.00963303013755],
      [11097.100808281812, 2.8187355684997275],
      [15421.044729088999, 4.345532841523333],
      [7366.888428010821, 17.15619795808815],
      [5733.904322760456, 22.04218785172386],
    ])
    const at22 = restingOrder('at22', answers[1], 'YES', 234, 0.22)
    const trans = useMarket(answers, [at22])

    const { result } = await placeBetMain(
      {
        contractId: 'market',
        answerId: 'answer1',
        outcome: 'NO',
        amount: 50,
      } as Parameters<typeof placeBetMain>[0],
      'taker',
      false
    )

    expect(result.amount).toBeCloseTo(50, 8)
    expect(result.probAfter).toBeLessThan(0.22)
    // Written in the one transaction, with the order's cancellation.
    expect(trans.multi).toHaveBeenCalledTimes(1)
    expect(mocked(cancelLimitOrdersQuery)).toHaveBeenCalledWith([at22])
    // The maker's balance was read again inside the transaction.
    expect(mocked(getUserBalancesAndMetrics).mock.calls[0][1]).toEqual([
      'taker',
      'maker',
    ])
  })
})
