import { sumBy } from 'lodash'
import { Answer } from './answer'
import { calculateCpmmMultiArbitrageBet } from './calculate-cpmm-arbitrage'
import { getCpmmProbability } from './calculate-cpmm'
import { getFeeTotal } from './fees'

describe('calculateCpmmMultiArbitrageBet', () => {
  it('should sum to 1 after bet', async () => {
    const answers: Answer[] = [
      getAnswer(1, 0.4),
      getAnswer(2, 0.3),
      getAnswer(3, 0.1),
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
      getAnswer(1, 0.4),
      getAnswer(2, 0.3),
      getAnswer(3, 0.1),
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

const getAnswer = (index: number, prob: number, userId = '1') => {
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
