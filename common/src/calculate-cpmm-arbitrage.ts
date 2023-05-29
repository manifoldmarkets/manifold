import { Dictionary, groupBy, sum, sumBy } from 'lodash'
import { Answer } from './answer'
import { LimitBet } from './bet'
import {
  calculateAmountToBuyShares,
  getCpmmProbability,
} from './calculate-cpmm'
import { binarySearch } from './util/algos'
import { computeFills } from './new-bet'

export function calculateCpmmMultiArbitrageBetYes(
  answers: Answer[],
  answerToBuy: Answer,
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const startTime = Date.now()
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  const maxProb = Math.max(...answers.map((a) => a.prob))
  const maxNoShares = betAmount / (1 - maxProb)
  console.log('max No shares', maxNoShares)

  const noShares = binarySearch(0, maxNoShares, (noShares) => {
    const { newPools } = buyNoSharesInAllAnswersThenYesInOne(
      answers,
      answerToBuy,
      unfilledBetsByAnswer,
      balanceByUserId,
      betAmount,
      limitProb,
      noShares
    )
    const diff = 1 - sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
    return diff
  })

  const { noBetResults, yesBetResult, newPools } =
    buyNoSharesInAllAnswersThenYesInOne(
      answers,
      answerToBuy,
      unfilledBetsByAnswer,
      balanceByUserId,
      betAmount,
      limitProb,
      noShares
    )

  const amount = sumBy(yesBetResult.takers, 'amount')
  const shares = sumBy(yesBetResult.takers, 'shares')
  const newPoolsByAnswerId = Object.fromEntries(
    answers.map((a, i) => [a.id, newPools[i]])
  )

  const endTime = Date.now()
  console.log('time', endTime - startTime, 'ms')

  console.log(
    'bet amount',
    betAmount,
    'no bet amounts',
    noBetResults.map((r) => r.takers.map((t) => t.amount)),
    'yes bet amount',
    amount
  )

  console.log(
    'getBinaryBuyYes before',
    answers.map((a) => a.prob),
    answers.map((a) => `${a.poolYes}, ${a.poolNo}`),
    'answerToBuy',
    answerToBuy
  )
  console.log(
    'getBinaryBuyYes after',
    newPools,
    newPools.map((pool) => getCpmmProbability(pool, 0.5)),
    'prob total',
    sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5)),
    'pool shares',
    newPools.map((pool) => `${pool.YES}, ${pool.NO}`),
    'no shares',
    noShares,
    'yes shares',
    shares
  )
  return { newPoolsByAnswerId, noBetResults, yesBetResult }
}

const buyNoSharesInAllAnswersThenYesInOne = (
  answers: Answer[],
  answerToBuy: Answer,
  unfilledBetsByAnswer: Dictionary<LimitBet[]>,
  balanceByUserId: { [userId: string]: number },
  betAmount: number,
  limitProb: number | undefined,
  noShares: number
) => {
  const noAmounts = answers.map(({ id, poolYes, poolNo }) =>
    calculateAmountToBuyShares(
      { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
      noShares,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
  )
  const totalNoAmount = sum(noAmounts)

  const noBetResults = noAmounts.map((noAmount, i) => {
    const answer = answers[i]
    const { poolYes, poolNo } = answer
    return {
      ...computeFills(
        { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
        'NO',
        noAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId
      ),
      answer,
    }
  })
  const resultingPools = noBetResults.map((r) => r.cpmmState.pool)

  const redeemedAmount = noShares * (answers.length - 1)
  const yesBetAmount = betAmount - totalNoAmount + redeemedAmount

  const index = answers.findIndex((a) => a.id === answerToBuy.id)
  const newPool = resultingPools[index]
  const yesBetResult = {
    ...computeFills(
      { pool: newPool, p: 0.5 },
      'YES',
      yesBetAmount,
      limitProb,
      unfilledBetsByAnswer[answerToBuy.id] ?? [],
      balanceByUserId
    ),
    answer: answerToBuy,
  }

  const newPools = [...resultingPools]
  newPools[index] = yesBetResult.cpmmState.pool

  return { noBetResults, yesBetResult, newPools }
}
