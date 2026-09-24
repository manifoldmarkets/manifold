import { sumBy } from 'lodash'
import { Answer } from './answer'
import { calculateCpmmMultiArbitrageBet } from './calculate-cpmm-arbitrage'
import { getCpmmProbability } from './calculate-cpmm'
import { noFees } from './fees'

// On a two-answer sum-to-one market, buying NO on the first answer and buying
// YES on the second answer are the same trade: the mana is split across the
// same two pools (a NO purchase in the first pool and a YES purchase in the
// second) so that the probabilities sum to one, and the shares bought pay out
// in the same state of the world. This documents the check behind the
// write-time canonicalisation discussion in common/src/versus.ts.
const getAnswer = (id: string, prob: number, index: number): Answer => {
  const k = 200
  const poolYes = k * (1 - prob)
  const poolNo = k * prob
  return {
    id,
    index,
    contractId: 'c1',
    userId: 'u1',
    text: id,
    createdTime: 0,
    poolYes,
    poolNo,
    prob: getCpmmProbability({ YES: poolYes, NO: poolNo }, 0.5),
    totalLiquidity: k,
    subsidyPool: 0,
    volume: 0,
    probChanges: { day: 0, week: 0, month: 0 },
  }
}

const poolsOf = (result: ReturnType<typeof calculateCpmmMultiArbitrageBet>) => {
  const { newBetResult, otherBetResults } = result
  const byAnswer: Record<string, { [outcome: string]: number }> = {}
  byAnswer[newBetResult.answer.id] = newBetResult.cpmmState.pool
  for (const r of otherBetResults) byAnswer[r.answer.id] = r.cpmmState.pool
  return byAnswer
}

describe('versus market: NO on the first answer equals YES on the second', () => {
  for (const [probA, amount] of [
    [0.5, 10],
    [0.3, 25],
    [0.8, 100],
    [0.62, 3],
  ] as const) {
    it(`gives the same pools and shares at ${probA} for ${amount}`, () => {
      const make = () => [
        getAnswer('a', probA, 0),
        getAnswer('b', 1 - probA, 1),
      ]

      const noOnA = calculateCpmmMultiArbitrageBet(
        make(),
        make()[0],
        'NO',
        amount,
        undefined,
        [],
        {},
        noFees
      )
      const yesOnB = calculateCpmmMultiArbitrageBet(
        make(),
        make()[1],
        'YES',
        amount,
        undefined,
        [],
        {},
        noFees
      )

      const poolsNoOnA = poolsOf(noOnA)
      const poolsYesOnB = poolsOf(yesOnB)
      for (const id of ['a', 'b']) {
        expect(poolsNoOnA[id].YES).toBeCloseTo(poolsYesOnB[id].YES, 6)
        expect(poolsNoOnA[id].NO).toBeCloseTo(poolsYesOnB[id].NO, 6)
      }
      const probSum = sumBy(Object.values(poolsNoOnA), (pool) =>
        getCpmmProbability(pool, 0.5)
      )
      expect(probSum).toBeCloseTo(1, 6)

      // Same amount spent, same number of shares, and the shares are
      // equivalent: NO shares on `a` pay out exactly when `b` wins.
      expect(sumBy(noOnA.newBetResult.takers, 'amount')).toBeCloseTo(
        sumBy(yesOnB.newBetResult.takers, 'amount'),
        6
      )
      expect(sumBy(noOnA.newBetResult.takers, 'shares')).toBeCloseTo(
        sumBy(yesOnB.newBetResult.takers, 'shares'),
        6
      )
      expect(noOnA.newBetResult.outcome).toBe('NO')
      expect(noOnA.newBetResult.answer.id).toBe('a')
      expect(yesOnB.newBetResult.outcome).toBe('YES')
      expect(yesOnB.newBetResult.answer.id).toBe('b')
    })
  }
})
