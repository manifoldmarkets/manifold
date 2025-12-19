import { groupBy, sumBy } from 'lodash'
import { Answer } from './answer'
import { Bet } from './bet'
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
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  }
}

const getNumericAnswers = (min: number, max: number, step: number) => {
  const bucketRanges = getMultiNumericAnswerBucketRanges(min, max, step)
  const prob = 1 / bucketRanges.length
  return bucketRanges.map((_, i) => getAnswer(i, prob))
}
