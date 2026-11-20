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
jest.mock('shared/audit-events', () => ({
  trackPublicAuditBetEvent: jest.fn(),
}))
jest.mock('shared/helpers/auth', () => ({ throwErrorIfNotAdmin: jest.fn() }))
jest.mock('shared/helpers/user-contract-loans', () => ({
  getLoanTrackingRows: jest.fn(),
  upsertLoanTrackingQuery: jest.fn(),
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
import { sellShares } from 'api/sell-shares'
import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { noFees } from 'common/fees'
import { cloneDeep, groupBy, last, map, pick, sumBy, uniq } from 'lodash'
import { insertZeroAmountLimitBet } from 'shared/supabase/bets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { bulkIncrementBalancesQuery } from 'shared/supabase/users'

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

// "Largest company end of 2026?" on 2026-11-13. NVIDIA is the second answer,
// at 22.02%.
const largestCompanyAnswers = () =>
  answersWith([
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

const sumToOneMarket = (answers: Answer[]) => ({
  id: 'market',
  slug: 'market',
  creatorId: 'creator',
  mechanism: 'cpmm-multi-1',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: true,
  visibility: 'public',
  token: 'MANA',
  collectedFees: noFees,
  volume: 0,
  totalLiquidity: 1000,
  uniqueBettorCount: 0,
  answers,
})

// A binary market at 25%.
const binaryMarket = () => ({
  id: 'market',
  slug: 'market',
  creatorId: 'creator',
  mechanism: 'cpmm-1',
  outcomeType: 'BINARY',
  visibility: 'public',
  token: 'MANA',
  pool: { YES: 100 * Math.sqrt(3), NO: 100 / Math.sqrt(3) },
  p: 0.5,
  collectedFees: noFees,
  volume: 0,
  totalLiquidity: 1000,
  uniqueBettorCount: 0,
})

const restingOrder = (
  id: string,
  userId: string,
  answer: Answer | undefined,
  outcome: 'YES' | 'NO',
  orderAmount: number,
  limitProb: number
): LimitBet => ({
  id,
  userId,
  contractId: 'market',
  answerId: answer?.id,
  createdTime: 0,
  amount: 0,
  loanAmount: 0,
  outcome,
  shares: 0,
  probBefore: answer?.prob ?? 0.25,
  probAfter: answer?.prob ?? 0.25,
  fees: noFees,
  isRedemption: false,
  orderAmount,
  limitProb,
  isFilled: false,
  isCancelled: false,
  fills: [],
})

const position = (answer: Answer | undefined, yesShares: number) => ({
  userId: 'seller',
  contractId: 'market',
  answerId: answer?.id ?? null,
  totalShares: { YES: yesShares },
  loan: 0,
  marginLoan: 0,
})

type Market = {
  contract: ReturnType<typeof sumToOneMarket> | ReturnType<typeof binaryMarket>
  answers: Answer[]
  orders: LimitBet[]
  // Over the defaults below.
  balances?: Record<string, number>
  // The seller's, for a sale.
  positions?: ReturnType<typeof position>[]
}

// Stands in for the database: the same market, orders and balances for the
// read before the transaction and the reads inside it, and for the write, the
// balances it leaves.
const useMarket = (market: Market) => {
  const { contract, answers, orders, positions = [] } = market
  const balances: Record<string, number> = {
    taker: 1000,
    seller: 500,
    maker: SPENT,
    creator: 100,
    ...market.balances,
  }
  // The orders a trade's reads select (whereLimitOrderBets in
  // api/helpers/bets): those across it on its own answer and, where the
  // answers sum to one, those alongside it on the others.
  const read = (trade: { answerId?: string; outcome: 'YES' | 'NO' }) => {
    const unfilledBets = cloneDeep(
      orders.filter((order) =>
        trade.answerId === undefined || order.answerId === trade.answerId
          ? order.outcome !== trade.outcome
          : 'shouldAnswersSumToOne' in contract &&
            order.outcome === trade.outcome
      )
    )
    return {
      contract: cloneDeep(contract),
      answers: cloneDeep(answers),
      unfilledBets,
      balanceByUserId: pick(balances, uniq(map(unfilledBets, 'userId'))),
    }
  }
  mocked(fetchContractBetDataAndValidate).mockImplementation(
    async (_pg, trade, uid) =>
      ({
        ...read(trade),
        user: { id: uid, username: uid, balance: balances[uid] },
        creator: undefined,
        contractMetrics: cloneDeep(positions),
      } as unknown as Awaited<
        ReturnType<typeof fetchContractBetDataAndValidate>
      >)
  )
  mocked(lockContractAndGetBetData).mockImplementation(
    async (_pg, trade) =>
      read(trade) as unknown as Awaited<
        ReturnType<typeof lockContractAndGetBetData>
      >
  )
  // Only the users asked for, as the query does.
  mocked(getUserBalancesAndMetrics).mockImplementation(
    async (_pg, userIds) =>
      ({
        balanceByUserId: pick(balances, userIds),
        contractMetrics: cloneDeep(positions),
      } as unknown as Awaited<ReturnType<typeof getUserBalancesAndMetrics>>)
  )
  // The first statement of the write changes balances and returns each
  // changed user's new one.
  const balancesWritten = () => {
    const changes = last(mocked(bulkIncrementBalancesQuery).mock.calls)?.[0]
    return map(groupBy(changes, 'id'), (ofUser, id) => ({
      id,
      balance: (balances[id] ?? 0) + sumBy(ofUser, (c) => c.balance ?? 0),
    }))
  }
  const trans = {
    multi: jest.fn(async () => [
      balancesWritten(),
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
  return { trans, balancesWritten }
}

const bet = async (body: {
  answerId?: string
  outcome: 'YES' | 'NO'
  amount: number
  limitProb?: number
}) => {
  const { result } = await placeBetMain(
    { contractId: 'market', ...body } as Parameters<typeof placeBetMain>[0],
    'taker',
    false
  )
  return result
}

const sell = async (body: {
  answerId?: string
  outcome: 'YES' | 'NO'
  shares: number
}) => {
  const response = await sellShares(
    { contractId: 'market', ...body },
    { uid: 'seller', creds: { kind: 'jwt' } } as Parameters<
      typeof sellShares
    >[1],
    {} as Parameters<typeof sellShares>[2]
  )
  return (
    response as unknown as {
      result: { amount: number; shares: number; probAfter: number }
    }
  ).result
}

// The users whose balances the transaction read again, beyond those read with
// the orders.
const balancesReadAgain = () =>
  mocked(getUserBalancesAndMetrics).mock.calls.map((call) => call[1])

describe("maker balances in a trade's transaction", () => {
  beforeEach(() => jest.clearAllMocks())

  // A trade is worked out twice: before its transaction with every maker's
  // balance, and inside it. If the two match different makers it is refused
  // with "Please try betting again." Inside the transaction the makers the
  // first pass had not matched were taken to have all they needed, so an order
  // the first pass had passed by for want of balance was filled by the second,
  // and the trade was refused however often it was retried. They now keep the
  // balance read with their order.

  describe('a bet', () => {
    it.each<[string, number]>([
      ['a sliver', SPENT],
      ['nothing', 0],
      ['less than nothing', -1],
    ])(
      'is placed as a limit order at a price where the only order across it is from a maker with %s',
      async (_, makerBalance) => {
        // Three answers at 50%, 30% and 20%. A maker with nothing to pay with
        // has a NO order resting on the first at 50%, and someone bids YES
        // there at 50%. Nothing can fill, and where the answers sum to one
        // the result for a bet that fills nothing names no maker, whatever
        // the maker's balance.
        const answers = answersWith([
          [100, 100],
          [152.75252316519467, 65.46536707079771],
          [200, 50],
        ])
        useMarket({
          contract: sumToOneMarket(answers),
          answers,
          orders: [restingOrder('at50', 'maker', answers[0], 'NO', 100, 0.5)],
          balances: { maker: makerBalance },
        })

        const result = await bet({
          answerId: 'answer0',
          outcome: 'YES',
          amount: 50,
          limitProb: 0.5,
        })

        expect(result.betId).toBe('placed')
        expect(result.amount).toBe(0)
        expect(mocked(insertZeroAmountLimitBet)).toHaveBeenCalledTimes(1)
        expect(mocked(insertZeroAmountLimitBet).mock.calls[0][0]).toMatchObject(
          {
            userId: 'taker',
            answerId: 'answer0',
            outcome: 'YES',
            amount: 0,
            orderAmount: 50,
            limitProb: 0.5,
            isFilled: false,
          }
        )
        // No maker matched, so only the taker's balance was read again.
        expect(balancesReadAgain()).toEqual([['taker']])
      }
    )

    it('is made when it reaches an order whose maker is out of balance', async () => {
      // NVIDIA at 22.02%, and a YES order resting on it at 22% whose maker
      // had 6.46e-15 left. That fills nothing that counts, and at this price
      // the order is not cancelled either, so the first pass matches no
      // maker. From 10 to 13 November 2026 every bet that took NVIDIA down to
      // 22% was refused.
      const answers = largestCompanyAnswers()
      const { trans } = useMarket({
        contract: sumToOneMarket(answers),
        answers,
        orders: [restingOrder('at22', 'maker', answers[1], 'YES', 234, 0.22)],
      })

      const result = await bet({
        answerId: 'answer1',
        outcome: 'NO',
        amount: 50,
      })

      // All of it bought from the pool, through the order's price.
      expect(result.amount).toBeCloseTo(50, 8)
      expect(result.probAfter).toBeLessThan(0.22)
      expect(trans.multi).toHaveBeenCalledTimes(1)
      expect(balancesReadAgain()).toEqual([['taker']])
    })

    it('is made when it reaches such an order on a binary market', async () => {
      // The same order on a binary market at 25%.
      const { trans } = useMarket({
        contract: binaryMarket(),
        answers: [],
        orders: [restingOrder('at22', 'maker', undefined, 'YES', 234, 0.22)],
      })

      const result = await bet({ outcome: 'NO', amount: 200 })

      expect(result.amount).toBeCloseTo(200, 8)
      expect(result.probAfter).toBeLessThan(0.22)
      expect(trans.multi).toHaveBeenCalledTimes(1)
      expect(balancesReadAgain()).toEqual([['taker']])
    })

    it('still pays its bonus to a creator who is below zero and has an order it does not reach', async () => {
      // The creator is at -50 and has an order that is read with the bet's
      // but not reached, so the creator is not one of its makers. The bet
      // pays the creator a bonus, which leaves them below zero but better
      // off. The write refuses a trade that leaves someone below zero and
      // worse off than they started. While a maker who was not matched was
      // taken to have unlimited balance, that check had to skip them. It now
      // compares with their real balance, and this must still be allowed.
      const answers = largestCompanyAnswers()
      const { trans, balancesWritten } = useMarket({
        contract: sumToOneMarket(answers),
        answers,
        orders: [restingOrder('at90', 'creator', answers[2], 'NO', 20, 0.9)],
        balances: { creator: -50 },
      })

      const result = await bet({
        answerId: 'answer1',
        outcome: 'NO',
        amount: 50,
      })

      expect(result.amount).toBeCloseTo(50, 8)
      expect(trans.multi).toHaveBeenCalledTimes(1)
      expect(balancesReadAgain()).toEqual([['taker']])
      const creator = balancesWritten().find((user) => user.id === 'creator')
      expect(creator?.balance).toBeGreaterThan(-50)
      expect(creator?.balance).toBeLessThan(0)
    })
  })

  describe('a sale', () => {
    it('is made when it reaches an order whose maker is out of balance', async () => {
      // The same market and order. Selling YES in NVIDIA takes it down
      // through 22% as buying NO does.
      const answers = largestCompanyAnswers()
      const { trans } = useMarket({
        contract: sumToOneMarket(answers),
        answers,
        orders: [restingOrder('at22', 'maker', answers[1], 'YES', 234, 0.22)],
        positions: [position(answers[1], 300)],
      })

      const sale = await sell({
        answerId: 'answer1',
        outcome: 'YES',
        shares: 300,
      })

      expect(sale.shares).toBeCloseTo(-300, 8)
      expect(sale.amount).toBeLessThan(0)
      expect(sale.probAfter).toBeLessThan(0.22)
      expect(trans.multi).toHaveBeenCalledTimes(1)
      expect(balancesReadAgain()).toEqual([['seller']])
    })

    it('is made when it reaches such an order on a binary market', async () => {
      // The same order on a binary market at 25%.
      const { trans } = useMarket({
        contract: binaryMarket(),
        answers: [],
        orders: [restingOrder('at22', 'maker', undefined, 'YES', 234, 0.22)],
        positions: [position(undefined, 300)],
      })

      const sale = await sell({ outcome: 'YES', shares: 300 })

      expect(sale.shares).toBeCloseTo(-300, 8)
      expect(sale.amount).toBeLessThan(0)
      expect(sale.probAfter).toBeLessThan(0.22)
      expect(trans.multi).toHaveBeenCalledTimes(1)
      expect(balancesReadAgain()).toEqual([['seller']])
    })

    it('is refused when it would take more from a maker than they have', async () => {
      // Answers at 50%, 30% and 20%. Selling YES in the first buys YES in the
      // other two, where one maker has a NO order just above each price and 5
      // to pay with. Each of those two legs is worked out from the maker's
      // whole balance, so together they ask the maker for 10. (That the legs
      // do not share the balance is a fault of its own. This pins only that
      // such a sale is refused and not paid for.) Both passes match the
      // maker, their balance is read again, and the write refuses the sale
      // because it leaves them below zero and worse off.
      const answers = answersWith([
        [100, 100],
        [152.75252316519467, 65.46536707079771],
        [200, 50],
      ])
      const { trans, balancesWritten } = useMarket({
        contract: sumToOneMarket(answers),
        answers,
        orders: [
          restingOrder('at31', 'maker', answers[1], 'NO', 100, 0.31),
          restingOrder('at21', 'maker', answers[2], 'NO', 100, 0.21),
        ],
        balances: { maker: 5 },
        positions: [position(answers[0], 60)],
      })

      await expect(
        sell({ answerId: 'answer0', outcome: 'YES', shares: 60 })
      ).rejects.toMatchObject({
        code: 403,
        message: 'Maker has insufficient balance.',
      })

      expect(balancesReadAgain()).toEqual([['seller', 'maker']])
      expect(trans.multi).toHaveBeenCalledTimes(1)
      const maker = balancesWritten().find((user) => user.id === 'maker')
      expect(maker?.balance).toBeCloseTo(-5, 8)
    })
  })
})
