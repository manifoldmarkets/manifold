import { sumBy } from 'lodash'
import { Answer } from './answer'
import {
  calculateCpmmMultiArbitrageBet,
  calculateCpmmMultiArbitrageYesBets,
} from './calculate-cpmm-arbitrage'
import { getCpmmProbability } from './calculate-cpmm'
import { getFeeTotal } from './fees'
import { getMultiNumericAnswerBucketRanges } from './multi-numeric'

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
      { user1: 100, user2: 100, user3: 100 }
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
      { user1: 100, user2: 100, user3: 100 }
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

describe('calculateCpmmMultiArbitrageYesBets', () => {
  it('should sum to 1 after bet', async () => {
    const answers: Answer[] = getNumericAnswers(0, 100, 10)
    const result = calculateCpmmMultiArbitrageYesBets(
      answers,
      answers.slice(0, 3),
      30,
      undefined,
      [],
      {}
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
      {}
    )
    const { newBetResults, otherBetResults } = result

    const amountInShares =
      betAmount -
      sumBy(newBetResults, (b) => getFeeTotal(b.totalFees)) -
      sumBy(otherBetResults, (b) => getFeeTotal(b.totalFees))
    const answerYesShares = convertAnswerPoolsToYesPools(answers)
    const initialYesShares = answerYesShares.map((a) => a + amountInShares)

    const finalPools = [
      ...newBetResults.map((r) => r.cpmmState.pool),
      ...otherBetResults.map((b) => b.cpmmState.pool),
    ].map(({ YES, NO }) => ({ poolYes: YES, poolNo: NO }))
    const finalAnswerYesShares = convertAnswerPoolsToYesPools(finalPools)

    for (const newBetResult of newBetResults) {
      const purchasedShares = sumBy(newBetResult.takers, (t) => t.shares)
      const index = answers.findIndex((a) => a.id === newBetResult.answer.id)
      finalAnswerYesShares[index] += purchasedShares
    }

    for (let i = 0; i < answers.length; i++) {
      expect(
        Math.abs(finalAnswerYesShares[i] - initialYesShares[i]) < 0.01
      ).toBeTruthy()
    }
  })
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
  }
}

const getNumericAnswers = (min: number, max: number, step: number) => {
  const bucketRanges = getMultiNumericAnswerBucketRanges(min, max, step)
  const prob = 1 / bucketRanges.length
  const answers = bucketRanges.map(([min, max], i) => getAnswer(i, prob))
  return answers
}
