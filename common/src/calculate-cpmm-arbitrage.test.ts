import { groupBy, sumBy } from 'lodash'
import { Answer } from './answer'
import { Bet, LimitBet } from './bet'
import {
  calculateCpmmMultiSumsToOneSale,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  calculateCpmmMultiArbitrageBet,
  calculateCpmmMultiArbitrageSellYesEqually,
  calculateCpmmMultiArbitrageYesBets,
} from './calculate-cpmm-arbitrage'
import { getFeeTotal, getTakerFee, noFees } from './fees'
import { getMultiNumericAnswerBucketRanges } from './number'
import { getNewSellBetInfo } from './sell-bet'

describe('calculateCpmmMultiArbitrageBet', () => {
  it('should sum to 1 after bet', async () => {
    const answers: Answer[] = [
      getAnswer(1, 0.5),
      getAnswer(2, 0.3),
      getAnswer(3, 0.2),
    ]
    const result = calculateCpmmMultiArbitrageBet(
      answers,
      answers[0],
      'YES',
      10,
      undefined,
      [],
      { user1: 100, user2: 100, user3: 100 },
      noFees
    )
    const { newBetResult, otherBetResults } = result
    const pools = [
      newBetResult.cpmmState.pool,
      ...otherBetResults.map((b) => b.cpmmState.pool),
    ]
    const probSum = sumBy(pools, (pool) => getCpmmProbability(pool, 0.5))

    expect(probSum).toBeCloseTo(1)
  })

  it('should conserve shares', async () => {
    const answers: Answer[] = [
      getAnswer(1, 0.5),
      getAnswer(2, 0.3),
      getAnswer(3, 0.2),
    ]

    const betAmount = 10
    const result = calculateCpmmMultiArbitrageBet(
      answers,
      answers[0],
      'YES',
      betAmount,
      undefined,
      [],
      { user1: 100, user2: 100, user3: 100 },
      noFees
    )
    const { newBetResult, otherBetResults } = result

    const amountInShares =
      betAmount -
      getFeeTotal(newBetResult.totalFees) -
      sumBy(otherBetResults, (b) => getFeeTotal(b.totalFees))
    const answerYesShares = convertAnswerPoolsToYesPools(answers)
    const initialYesShares = answerYesShares.map((a) => a + amountInShares)

    const finalPools = [
      newBetResult.cpmmState.pool,
      ...otherBetResults.map((b) => b.cpmmState.pool),
    ].map(({ YES, NO }) => ({ poolYes: YES, poolNo: NO }))
    const finalAnswerYesShares = convertAnswerPoolsToYesPools(finalPools)

    const purchasedShares = sumBy(newBetResult.takers, (t) => t.shares)
    finalAnswerYesShares[0] += purchasedShares

    for (let i = 0; i < answers.length; i++) {
      expect(initialYesShares[i]).toBeCloseTo(finalAnswerYesShares[i])
    }
  })

  it('does not overdraw the same maker across indirect YES legs', async () => {
    const answers: Answer[] = [
      getAnswer(1, 0.5),
      getAnswer(2, 0.3),
      getAnswer(3, 0.2),
    ]
    const makerBalance = 5
    const unfilledBets: LimitBet[] = [
      getLimitBet('limit1', answers[1], 'YES', 'maker', 10, 0.9),
      getLimitBet('limit2', answers[2], 'YES', 'maker', 10, 0.9),
    ]

    const result = calculateCpmmMultiArbitrageBet(
      answers,
      answers[0],
      'YES',
      100,
      undefined,
      unfilledBets,
      { maker: makerBalance },
      noFees
    )

    const totalMakerSpent = getMakerSpent(result, 'maker')
    expect(totalMakerSpent).toBeLessThanOrEqual(makerBalance + 1e-9)
  })

  it('does not overdraw the same maker across indirect NO legs', async () => {
    const answers: Answer[] = [
      getAnswer(1, 0.5),
      getAnswer(2, 0.3),
      getAnswer(3, 0.2),
    ]
    const makerBalance = 5
    const unfilledBets: LimitBet[] = [
      getLimitBet('limit1', answers[1], 'NO', 'maker', 10, 0.1),
      getLimitBet('limit2', answers[2], 'NO', 'maker', 10, 0.1),
    ]

    const result = calculateCpmmMultiArbitrageBet(
      answers,
      answers[0],
      'NO',
      100,
      undefined,
      unfilledBets,
      { maker: makerBalance },
      noFees
    )

    const totalMakerSpent = getMakerSpent(result, 'maker')
    expect(totalMakerSpent).toBeLessThanOrEqual(makerBalance + 1e-9)
  })
})

describe('calculateCpmmMultiSumsToOneSale', () => {
  it('should conserve shares after sell YES', async () => {
    const answers: Answer[] = [
      getAnswer(1, 0.5),
      getAnswer(2, 0.3),
      getAnswer(3, 0.2),
    ]

    const sharesToSell = 10

    const initialYesShares = convertAnswerPoolsToYesPools(answers)
    initialYesShares[0] += sharesToSell

    const result = calculateCpmmMultiSumsToOneSale(
      answers,
      answers[0],
      sharesToSell,
      'YES',
      undefined,
      [],
      {},
      noFees
    )
    const { newBetResult, otherBetResults } = result

    const finalPools = [
      newBetResult.cpmmState.pool,
      ...otherBetResults.map((b) => b.cpmmState.pool),
    ].map(({ YES, NO }) => ({ poolYes: YES, poolNo: NO }))
    const finalAnswerYesShares = convertAnswerPoolsToYesPools(finalPools)

    const amount = sumBy(newBetResult.takers, (t) => t.amount)
    const sellFees =
      getFeeTotal(newBetResult.totalFees) +
      sumBy(otherBetResults, (b) => getFeeTotal(b.totalFees))
    console.log('amount', amount, 'sellFees', sellFees)
    for (let i = 0; i < answers.length; i++) {
      finalAnswerYesShares[i] += sellFees - amount
    }

    for (let i = 0; i < answers.length; i++) {
      expect(initialYesShares[i]).toBeCloseTo(finalAnswerYesShares[i])
    }
  })

  it('should conserve shares after sell NO', async () => {
    const answers: Answer[] = [
      getAnswer(1, 0.5),
      getAnswer(2, 0.3),
      getAnswer(3, 0.2),
    ]

    const sharesToSell = 10

    const initialYesShares = convertAnswerPoolsToYesPools(answers)
    for (let i = 1; i < answers.length; i++) {
      initialYesShares[i] += sharesToSell
    }

    const result = calculateCpmmMultiSumsToOneSale(
      answers,
      answers[0],
      sharesToSell,
      'NO',
      undefined,
      [],
      {},
      noFees
    )
    const { newBetResult, otherBetResults } = result

    const finalPools = [
      newBetResult.cpmmState.pool,
      ...otherBetResults.map((b) => b.cpmmState.pool),
    ].map(({ YES, NO }) => ({ poolYes: YES, poolNo: NO }))
    const finalAnswerYesShares = convertAnswerPoolsToYesPools(finalPools)

    const amount = sumBy(newBetResult.takers, (t) => t.amount)
    const sellFees =
      getFeeTotal(newBetResult.totalFees) +
      sumBy(otherBetResults, (b) => getFeeTotal(b.totalFees))
    for (let i = 0; i < answers.length; i++) {
      finalAnswerYesShares[i] += sellFees - amount
    }

    for (let i = 0; i < answers.length; i++) {
      expect(initialYesShares[i]).toBeCloseTo(finalAnswerYesShares[i])
    }
  })

  it('should charge sell fee on shares bought YES', async () => {
    const answers: Answer[] = [
      getAnswer(1, 0.5),
      getAnswer(2, 0.3),
      getAnswer(3, 0.2),
    ]

    const sharesToSell = 10

    const initialYesShares = convertAnswerPoolsToYesPools(answers)
    initialYesShares[0] += sharesToSell

    const result = calculateCpmmMultiSumsToOneSale(
      answers,
      answers[0],
      sharesToSell,
      'YES',
      undefined,
      [],
      {},
      noFees
    )
    const { newBetResult, otherBetResults, buyAmount } = result
    const sellFee =
      getFeeTotal(newBetResult.totalFees) +
      sumBy(otherBetResults, (b) => getFeeTotal(b.totalFees))

    const expectedFee = getTakerFee(sharesToSell, buyAmount / sharesToSell)
    expect(sellFee).toBeCloseTo(expectedFee)
  })

  it('should charge sell fee on shares bought NO', async () => {
    const answers: Answer[] = [
      getAnswer(1, 0.5),
      getAnswer(2, 0.3),
      getAnswer(3, 0.2),
    ]

    const sharesToSell = 10

    const initialYesShares = convertAnswerPoolsToYesPools(answers)
    initialYesShares[0] += sharesToSell

    const result = calculateCpmmMultiSumsToOneSale(
      answers,
      answers[0],
      sharesToSell,
      'NO',
      undefined,
      [],
      {},
      noFees
    )
    const { newBetResult, otherBetResults, buyAmount } = result
    const sellFee =
      getFeeTotal(newBetResult.totalFees) +
      sumBy(otherBetResults, (b) => getFeeTotal(b.totalFees))

    const expectedFee = getTakerFee(sharesToSell, buyAmount / sharesToSell)
    expect(sellFee).toBeCloseTo(expectedFee)
  })
})

describe('calculateCpmmMultiArbitrageYesBets', () => {
  it('should sum to 1 after bet', async () => {
    const answers: Answer[] = getNumericAnswers(0, 100, 10)
    const result = calculateCpmmMultiArbitrageYesBets(
      answers,
      answers.slice(0, 3),
      30,
      undefined,
      [],
      {},
      noFees
    )
    const { newBetResults, otherBetResults } = result
    const pools = [
      ...newBetResults.map((r) => r.cpmmState.pool),
      ...otherBetResults.map((b) => b.cpmmState.pool),
    ]
    const probSum = sumBy(pools, (pool) => getCpmmProbability(pool, 0.5))

    expect(probSum).toBeCloseTo(1)
  })

  it('should conserve shares', async () => {
    const answers: Answer[] = getNumericAnswers(0, 100, 10)
    const betAmount = 30
    const result = calculateCpmmMultiArbitrageYesBets(
      answers,
      answers.slice(0, 3),
      betAmount,
      undefined,
      [],
      {},
      noFees
    )
    const { newBetResults, otherBetResults, updatedAnswers } = result

    const amountInShares =
      betAmount -
      sumBy(newBetResults, (b) => getFeeTotal(b.totalFees)) -
      sumBy(otherBetResults, (b) => getFeeTotal(b.totalFees))
    const answerYesShares = convertAnswerPoolsToYesPools(answers)
    const initialYesShares = answerYesShares.map((a) => a + amountInShares)

    const afterBuyAnswerYesShares = convertAnswerPoolsToYesPools(updatedAnswers)

    for (const newBetResult of newBetResults) {
      const purchasedShares = sumBy(newBetResult.takers, (t) => t.shares)
      const index = answers.findIndex((a) => a.id === newBetResult.answer.id)
      afterBuyAnswerYesShares[index] += purchasedShares
    }

    for (let i = 0; i < answers.length; i++) {
      expect(
        Math.abs(afterBuyAnswerYesShares[i] - initialYesShares[i]) < 0.01
      ).toBeTruthy()
    }

    // Make sure selling also conserves shares
    const bets = newBetResults.map(
      (r) =>
        getNewSellBetInfo(
          r,
          Date.now(),
          answers,
          { id: 'contract1', visibility: 'public' } as any,
          {}
        ).bet as Bet
    )
    const saleResults = calculateCpmmMultiArbitrageSellYesEqually(
      updatedAnswers,
      groupBy(bets, 'answerId'),
      [],
      {},
      noFees
    )
    const afterSaleAnswerYesShares = convertAnswerPoolsToYesPools(
      saleResults.updatedAnswers
    )
    const preBuyYesShares = answerYesShares.map((a) => a)

    for (let i = 0; i < answers.length; i++) {
      expect(
        Math.abs(afterSaleAnswerYesShares[i] - preBuyYesShares[i]) < 0.01
      ).toBeTruthy()
    }
  })

  it('does not spend more than passed amount across multi-buy answers', async () => {
    const answers: Answer[] = getNumericAnswers(0, 100, 10)
    const betAmount = 100
    const { newBetResults } = calculateCpmmMultiArbitrageYesBets(
      answers,
      answers.slice(0, 3),
      betAmount,
      undefined,
      [],
      {},
      noFees
    )
    const totalUserAmount = sumBy(
      newBetResults.flatMap((r) => r.takers),
      (t) => t.amount
    )
    expect(totalUserAmount).toBeLessThanOrEqual(betAmount + 1e-9)
  })

  it('does not overfill maker limit orders in multi-buy', async () => {
    const answers: Answer[] = getNumericAnswers(0, 100, 10)
    const [a0, a1] = answers
    // Create two small NO limit orders on two answers at low limitProb so they match YES takers
    const now = Date.now()
    const makeLimit = (
      id: string,
      answer: Answer,
      userId: string,
      orderAmount: number
    ) => ({
      id,
      userId,
      contractId: 'c1',
      answerId: answer.id,
      createdTime: now,
      amount: 0,
      loanAmount: 0,
      outcome: 'NO',
      shares: 0,
      probBefore: answer.prob,
      probAfter: answer.prob,
      fees: noFees,
      isRedemption: false,
      visibility: 'public',
      orderAmount,
      limitProb: 0.05,
      isFilled: false,
      isCancelled: false,
      fills: [],
    })
    const makerA = makeLimit('makerA1', a0, 'makerA', 5)
    const makerB = makeLimit('makerB1', a1, 'makerB', 7)
    const unfilledBets = [makerA, makerB]
    const balanceByUserId = { makerA: 1e6, makerB: 1e6 }

    const { newBetResults, otherBetResults } =
      calculateCpmmMultiArbitrageYesBets(
        answers,
        answers.slice(0, 3),
        100,
        undefined,
        unfilledBets,
        balanceByUserId,
        noFees
      )

    const allMakers = [
      ...newBetResults.flatMap((r) => r.makers),
      ...otherBetResults.flatMap((r) => r.makers),
    ]
    const byBetId = groupBy(allMakers, (m) => m.bet.id)
    const orderAmountById: Record<string, number> = {
      [makerA.id]: makerA.orderAmount,
      [makerB.id]: makerB.orderAmount,
    }
    for (const [betId, makers] of Object.entries(byBetId)) {
      const filled = sumBy(makers, (m) => m.amount)
      expect(filled).toBeLessThanOrEqual(orderAmountById[betId] + 1e-9)
    }
  })

  // it('should not fill limit orders outside the final price range in multi-bet (BUG)', async () => {
  //   // This test demonstrates the bug where multi-bet trades fill limit orders
  //   // at prices outside the [initial, final] range due to auto-arbitrage overshoot.
  //   //
  //   // Bug location: buyNoSharesInAnswers (lines 930-939 in calculate-cpmm-arbitrage.ts)
  //   // The redemption fills have matchedBetId: null, so limit orders matched during
  //   // the NO purchases aren't "unwound" when prices come back down.

  //   // Helper to create answer with specific liquidity
  //   const getAnswerWithLiquidity = (index: number, prob: number, k: number) => {
  //     const poolYes = Math.sqrt((k * (1 - prob)) / prob)
  //     const poolNo = k / poolYes
  //     return {
  //       id: `answer${index}`,
  //       contractId: `contract${index}`,
  //       userId: `user${index}`,
  //       text: `Answer ${index}`,
  //       createdTime: 0,
  //       index,
  //       prob,
  //       poolYes,
  //       poolNo,
  //       totalLiquidity: 0,
  //       subsidyPool: 0,
  //       probChanges: { day: 0, week: 0, month: 0 },
  //       volume: 0,
  //     }
  //   }

  //   // Setup: 5 equal probability answers at 20% each
  //   // Use moderate liquidity (k=1000) to allow for visible price movements
  //   const k = 1000
  //   const answers: Answer[] = [
  //     getAnswerWithLiquidity(1, 0.2, k), // A
  //     getAnswerWithLiquidity(2, 0.2, k), // B
  //     getAnswerWithLiquidity(3, 0.2, k), // C
  //     getAnswerWithLiquidity(4, 0.2, k), // D
  //     getAnswerWithLiquidity(5, 0.2, k), // E
  //   ]

  //   // First, do a single-answer bet to bring A from 20% to ~38%
  //   const firstBet = calculateCpmmMultiArbitrageBet(
  //     answers,
  //     answers[0],
  //     'YES',
  //     50, // Smaller bet to keep price around 35-40%
  //     undefined,
  //     [],
  //     {},
  //     noFees
  //   )

  //   // Update answers with new pools from first bet
  //   const updatedAnswersAfterFirst = answers.map((a) => {
  //     if (a.id === firstBet.newBetResult.answer.id) {
  //       const pool = firstBet.newBetResult.cpmmState.pool
  //       return {
  //         ...a,
  //         poolYes: pool.YES,
  //         poolNo: pool.NO,
  //         prob: getCpmmProbability(pool, 0.5),
  //       }
  //     }
  //     const otherBet = firstBet.otherBetResults.find(
  //       (b) => b.answer.id === a.id
  //     )
  //     if (otherBet) {
  //       const pool = otherBet.cpmmState.pool
  //       return {
  //         ...a,
  //         poolYes: pool.YES,
  //         poolNo: pool.NO,
  //         prob: getCpmmProbability(pool, 0.5),
  //       }
  //     }
  //     return a
  //   })

  //   const answerAAfterFirst = updatedAnswersAfterFirst.find(
  //     (a) => a.id === answers[0].id
  //   )!

  //   console.log('After first bet, Answer A prob:', answerAAfterFirst.prob)

  //   // Place a NO limit order at a price above the current price
  //   // This should be hit during the overshoot, then the price comes back below it
  //   const limitProb = answerAAfterFirst.prob + 0.05
  //   const limitOrder = {
  //     id: 'limit1',
  //     userId: 'makerUser',
  //     contractId: 'contract1',
  //     answerId: answers[0].id,
  //     createdTime: Date.now(),
  //     amount: 0,
  //     loanAmount: 0,
  //     outcome: 'NO' as const,
  //     shares: 0,
  //     probBefore: answerAAfterFirst.prob,
  //     probAfter: answerAAfterFirst.prob,
  //     fees: noFees,
  //     isRedemption: false,
  //     visibility: 'public' as const,
  //     orderAmount: 100,
  //     limitProb,
  //     isFilled: false,
  //     isCancelled: false,
  //     fills: [],
  //   }

  //   const unfilledBets = [limitOrder]
  //   const balanceByUserId = { makerUser: 1000 }

  //   // Execute multi-bet purchase on A and B with M$50
  //   // The key is that buying YES in both A and B causes A to overshoot,
  //   // then the auto-arb brings it back down
  //   const betAmount = 50
  //   const result = calculateCpmmMultiArbitrageYesBets(
  //     updatedAnswersAfterFirst,
  //     [updatedAnswersAfterFirst[0], updatedAnswersAfterFirst[1]], // Buy YES in A and B
  //     betAmount,
  //     undefined,
  //     unfilledBets,
  //     balanceByUserId,
  //     noFees
  //   )

  //   const { newBetResults, otherBetResults, updatedAnswers } = result

  //   // Get initial and final price for answer A
  //   const initialAnswerA = answerAAfterFirst
  //   const finalAnswerA = updatedAnswers.find((a) => a.id === answers[0].id)!

  //   // Check if any limit orders were filled
  //   const allMakers = [
  //     ...newBetResults.flatMap((r) => r.makers),
  //     ...otherBetResults.flatMap((r) => r.makers),
  //   ]
  //   const limitOrderFills = allMakers.filter((m) => m.bet.id === limitOrder.id)

  //   console.log('Initial A prob:', initialAnswerA.prob)
  //   console.log('Final A prob:', finalAnswerA.prob)
  //   console.log('Limit order at:', limitProb)
  //   console.log('Limit order fills:', limitOrderFills.length)
  //   if (limitOrderFills.length > 0) {
  //     console.log(
  //       'Limit order amount filled:',
  //       sumBy(limitOrderFills, (m) => m.amount)
  //     )
  //   }

  //   // For a NO limit order at limitProb, it should only fill if the price goes >= limitProb
  //   // and stays there. If the price temporarily goes above limitProb but comes back below,
  //   // the limit order should NOT remain filled (or should be "unfilled").
  //   if (limitOrderFills.length > 0) {
  //     // BUG: The limit order was filled, but let's check if it's outside the price range
  //     // If both initial and final are below the limit, then the fill is INVALID
  //     const isInvalidFill =
  //       initialAnswerA.prob < limitProb && finalAnswerA.prob < limitProb

  //     if (isInvalidFill) {
  //       console.log(
  //         '❌ BUG DETECTED: Limit order filled outside the [initial, final] price range!'
  //       )
  //       console.log(
  //         `  Initial: ${initialAnswerA.prob.toFixed(
  //           4
  //         )}, Final: ${finalAnswerA.prob.toFixed(4)}, Limit: ${limitProb}`
  //       )
  //     }

  //     // This test will FAIL due to the bug - the limit order gets filled
  //     // even though both initial and final prices are below the limit
  //     expect(isInvalidFill).toBe(false)
  //   } else {
  //     // If no limit orders were filled, the test passes but doesn't demonstrate the bug
  //     console.log(
  //       '⚠️  No limit orders filled - may need to adjust liquidity or bet amount'
  //     )
  //   }
  // })
})

// Convert all NO shares into YES shares.
// E.g. NO shares in answer A will be converted to YES shares in every other answer.
// Returns an array of YES shares for each answer.
const convertAnswerPoolsToYesPools = (
  answers: { poolYes: number; poolNo: number }[]
) => {
  return answers.map(
    (a) =>
      a.poolYes +
      sumBy(
        answers.filter((a2) => a2 !== a),
        (a) => a.poolNo
      )
  )
}

const getAnswer = (index: number, prob: number) => {
  const k = 100
  // y * n = k
  // prob = n / (y + n)
  // y * prob + n * prob = n
  // y = n * (1 - prob) / prob
  // y = (k / y) * (1 - prob) / prob
  // y^2 = k * (1 - prob) / prob
  // y = sqrt(k * (1 - prob) / prob)
  const poolYes = Math.sqrt((k * (1 - prob)) / prob)
  const poolNo = k / poolYes

  return {
    id: `answer${index}`,
    contractId: `contract${index}`,
    userId: `user${index}`,
    text: `Answer ${index}`,
    createdTime: 0,
    index,
    prob,
    poolYes,
    poolNo,
    p: 0.5,
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  }
}

const getMakerSpent = (
  result: ReturnType<typeof calculateCpmmMultiArbitrageBet>,
  userId: string
) => {
  const makerFills = [
    ...result.newBetResult.makers,
    ...result.otherBetResults.flatMap((b) => b.makers),
  ].filter((m) => m.bet.userId === userId)

  return sumBy(makerFills, (m) => m.amount)
}

const getLimitBet = (
  id: string,
  answer: Answer,
  outcome: 'YES' | 'NO',
  userId: string,
  orderAmount: number,
  limitProb: number
): LimitBet => ({
  id,
  userId,
  contractId: answer.contractId,
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

const getNumericAnswers = (min: number, max: number, step: number) => {
  const bucketRanges = getMultiNumericAnswerBucketRanges(min, max, step)
  const prob = 1 / bucketRanges.length
  return bucketRanges.map((_, i) => getAnswer(i, prob))
}

// --- cpmm-multi-2: per-answer p (general-p auto-arb) -------------------------
// Balanced pools (Y = N = L) give prob_i = p_i exactly, so a valid sum-to-one
// v2 market is just per-answer p that sums to 1. There is NO external p != 0.5
// oracle (vendor v1 throws on p != 0.5), so internal-consistency invariants and a
// cross-language anchor against the independent Python reference oracle
// (manifold/market_simulator.MarketSimulator.simulate_buy, per-answer p threaded
// in Slice 1b) do the validation. At p = 0.5 every path reduces to v1 (the suite
// staying byte-identical is the regression lock).
const getAnswerWithP = (index: number, p: number, L = 100): Answer =>
  ({
    id: `answer${index}`,
    contractId: `contract${index}`,
    userId: `user${index}`,
    text: `Answer ${index}`,
    createdTime: 0,
    index,
    prob: p, // balanced pool (Y = N = L) => prob = p
    poolYes: L,
    poolNo: L,
    p,
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  } as Answer)

// Final per-answer prob, matched to each answer by identity (id) — never by
// array position — and priced with that answer's own p.
const probsAfterBet = (
  result: ReturnType<typeof calculateCpmmMultiArbitrageBet>,
  answers: Answer[]
) => {
  const byId = new Map<string, number>()
  for (const r of [result.newBetResult, ...result.otherBetResults]) {
    byId.set(r.answer.id, getCpmmProbability(r.cpmmState.pool, r.cpmmState.p))
  }
  return answers.map((a) => byId.get(a.id)!)
}

describe('calculateCpmmMultiArbitrageBet — per-answer p (cpmm-multi-2)', () => {
  it('restores Σp = 1 (and is monotone) after a YES buy at non-uniform p', () => {
    for (const ps of [
      [0.5, 0.3, 0.2],
      [0.7, 0.2, 0.1],
      [0.6, 0.15, 0.15, 0.1],
      [0.9, 0.05, 0.05],
    ]) {
      const answers = ps.map((p, i) => getAnswerWithP(i, p))
      const result = calculateCpmmMultiArbitrageBet(
        answers,
        answers[0],
        'YES',
        25,
        undefined,
        [],
        {},
        noFees
      )
      const probs = probsAfterBet(result, answers)
      expect(sumBy(probs, (p) => p)).toBeCloseTo(1, 6)
      expect(probs[0]).toBeGreaterThan(ps[0]) // bought answer rises
      for (let i = 1; i < ps.length; i++) {
        expect(probs[i]).toBeLessThan(ps[i]) // every other answer falls
      }
    }
  })

  it('matches the Python reference oracle at p != 0.5 (cross-language anchor)', () => {
    const cases = [
      {
        ps: [0.5, 0.3, 0.2],
        sharesAns0: 46.82123779918318,
        probs: [0.5668062275, 0.261508744769, 0.171685027732],
      },
      {
        ps: [0.7, 0.2, 0.1],
        sharesAns0: 34.78445693634237,
        probs: [0.736335611567, 0.176510366064, 0.08715402237],
      },
    ]
    for (const { ps, sharesAns0, probs: expected } of cases) {
      const answers = ps.map((p, i) => getAnswerWithP(i, p))
      const result = calculateCpmmMultiArbitrageBet(
        answers,
        answers[0],
        'YES',
        25,
        undefined,
        [],
        {},
        noFees
      )
      const probs = probsAfterBet(result, answers)
      expected.forEach((e, i) => expect(probs[i]).toBeCloseTo(e, 6))
      const shares = sumBy(result.newBetResult.takers, 'shares')
      expect(shares).toBeCloseTo(sharesAns0, 4)
    }
  })
})

// --- cpmm-multi-2: direct (Approach C) multi-buy removes transient-overshoot fills ----------
// The v1 YES-basket auto-arb drives basket answers UP PAST their settled price, then back down,
// consuming and KEEPING resting makers crossed only in the transient band (the bug). The v2 solve
// (gated on the 'cpmm-multi-2' arg) buys each basket answer once, straight to final — every maker
// is crossed at most once, in one direction. Fixture mirrors the multibuy-limit-cases spec
// (5 answers @ 0.2, k=1000, YES basket {a0,a1}, bet 60; a0 settles ~0.399 with peak ~0.677 in v1).
const getAnswerK = (index: number, prob: number, k: number): Answer =>
  ({
    id: `answer${index}`,
    contractId: 'c',
    userId: `user${index}`,
    text: `Answer ${index}`,
    createdTime: 0,
    index,
    prob,
    poolYes: Math.sqrt((k * (1 - prob)) / prob),
    poolNo: k / Math.sqrt((k * (1 - prob)) / prob),
    p: 0.5,
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  } as Answer)

describe('calculateCpmmMultiArbitrageYesBets — cpmm-multi-2 no transient-overshoot fills', () => {
  const mkMarket = () => [0, 1, 2, 3, 4].map((i) => getAnswerK(i, 0.2, 1000))
  const BASKET = [0, 1]
  const BET = 60
  const runV2 = (orders: LimitBet[]) => {
    const answers = mkMarket()
    const res = calculateCpmmMultiArbitrageYesBets(
      answers,
      BASKET.map((i) => answers[i]),
      BET,
      undefined,
      orders,
      { mk: 1e9 },
      noFees,
      'cpmm-multi-2'
    )
    const finalById: Record<string, number> = {}
    for (const a of res.updatedAnswers)
      finalById[a.id] = getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
    const makers = [
      ...res.newBetResults.flatMap((r) => r.makers),
      ...res.otherBetResults.flatMap((r) => r.makers),
    ]
    const filledById = groupBy(makers, (mk) => mk.bet.id)
    const filled = (id: string) => sumBy(filledById[id] ?? [], (mk) => mk.amount)
    const cost =
      sumBy(res.newBetResults, (r) => sumBy(r.takers, 'amount')) +
      sumBy(res.otherBetResults, (r) => sumBy(r.takers, 'amount'))
    return { res, finalById, filled, cost }
  }

  // No-limit settle price of the traded answer a0 (used by the past-final case).
  const a0Final = runV2([]).finalById['answer0']

  it('no-limit: Σp = 1, cost = betAmount, traded answer rises (~0.399)', () => {
    const r = runV2([])
    expect(sumBy(r.res.updatedAnswers, (a) => r.finalById[a.id])).toBeCloseTo(1, 6)
    expect(r.cost).toBeCloseTo(BET, 3)
    expect(a0Final).toBeGreaterThan(0.2)
    expect(a0Final).toBeCloseTo(0.39942, 2)
  })

  it('in-path LARGE NO-ask on a basket answer -> price PINS at the limit (v1 mis-settles)', () => {
    const o = getLimitBet('L1', mkMarket()[0], 'NO', 'mk', 600, 0.3)
    const r = runV2([o])
    expect(r.finalById['answer0']).toBeCloseTo(0.3, 2) // rests AT the limit, not past it
    expect(r.filled('L1')).toBeGreaterThan(0)
  })

  it('past-final NO-ask (rho in the v1 overshoot band) -> UNFILLED (v1 keeps a phantom fill)', () => {
    // 0.5 is above the no-limit settle (~0.399) but below v1's transient peak (~0.677).
    const o = getLimitBet('L2', mkMarket()[0], 'NO', 'mk', 600, 0.5)
    const r = runV2([o])
    expect(r.filled('L2')).toBeLessThanOrEqual(1e-9) // never net-crossed
    expect(r.finalById['answer0']).toBeCloseTo(a0Final, 2) // order has no effect
  })
})
