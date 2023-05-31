import { Dictionary, groupBy, sum, sumBy } from 'lodash'
import { Answer } from './answer'
import { LimitBet } from './bet'
import {
  calculateAmountToBuySharesFixedP,
  getCpmmProbability,
} from './calculate-cpmm'
import { binarySearch } from './util/algos'
import { computeFills } from './new-bet'

export function calculateCpmmMultiArbitrageBet(
  answers: Answer[],
  answerToBuy: Answer,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  return outcome === 'YES'
    ? calculateCpmmMultiArbitrageBetYes(
        answers,
        answerToBuy,
        betAmount,
        limitProb,
        unfilledBets,
        balanceByUserId
      )
    : calculateCpmmMultiArbitrageBetNo(
        answers,
        answerToBuy,
        betAmount,
        limitProb,
        unfilledBets,
        balanceByUserId
      )
}

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

  const noSharePriceSum = sumBy(
    answers.filter((a) => a.id !== answerToBuy.id).map((a) => 1 - a.prob)
  )
  // If you spend all of amount on NO shares. Subtract out from the price the redemption mana.
  const maxNoShares = (0.5 * betAmount) / (noSharePriceSum - answers.length + 2)

  const noShares = binarySearch(0, maxNoShares, (noShares) => {
    const result = buyNoSharesInOtherAnswersThenYesInAnswer(
      answers,
      answerToBuy,
      unfilledBetsByAnswer,
      balanceByUserId,
      betAmount,
      limitProb,
      noShares
    )
    if (!result) {
      return 1
    }
    const newPools = [
      ...result.noBetResults.map((r) => r.cpmmState.pool),
      result.yesBetResult.cpmmState.pool,
    ]
    const diff = 1 - sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
    return diff
  })

  const result = buyNoSharesInOtherAnswersThenYesInAnswer(
    answers,
    answerToBuy,
    unfilledBetsByAnswer,
    balanceByUserId,
    betAmount,
    limitProb,
    noShares
  )
  if (!result) {
    throw new Error('Invariant failed in calculateCpmmMultiArbitrageBetYes')
  }

  const { noBetResults, yesBetResult } = result
  const yesAmount = sumBy(yesBetResult.takers, 'amount')
  const yesShares = sumBy(yesBetResult.takers, 'shares')
  const shares = yesShares + noShares
  const newPoolsByAnswerId = Object.fromEntries([
    ...noBetResults.map((r) => [r.answer.id, r.cpmmState.pool] as const),
    [yesBetResult.answer.id, yesBetResult.cpmmState.pool] as const,
  ])
  const newPools = Object.values(newPoolsByAnswerId)

  const endTime = Date.now()
  console.log('time', endTime - startTime, 'ms')

  console.log(
    'bet amount',
    betAmount,
    'no bet amounts',
    noBetResults.map((r) => r.takers.map((t) => t.amount)),
    'yes bet amount',
    yesAmount
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
  const newBetResult = { ...yesBetResult, outcome: 'YES' }
  const otherBetResults = noBetResults.map((r) => ({ ...r, outcome: 'NO' }))
  return { newBetResult, otherBetResults, shares, newPoolsByAnswerId }
}

const buyNoSharesInOtherAnswersThenYesInAnswer = (
  answers: Answer[],
  answerToBuy: Answer,
  unfilledBetsByAnswer: Dictionary<LimitBet[]>,
  balanceByUserId: { [userId: string]: number },
  betAmount: number,
  limitProb: number | undefined,
  noShares: number
) => {
  const otherAnswers = answers.filter((a) => a.id !== answerToBuy.id)
  const noAmounts = otherAnswers.map(({ id, poolYes, poolNo }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
      noShares,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
  )
  const totalNoAmount = sum(noAmounts)

  const noBetResults = noAmounts.map((noAmount, i) => {
    const answer = otherAnswers[i]
    const pool = { YES: answer.poolYes, NO: answer.poolNo }
    return {
      ...computeFills(
        { pool, p: 0.5 },
        'NO',
        noAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId
      ),
      answer,
    }
  })

  // Identity: No shares in all other answers is equal to noShares * (n-2) mana + yes shares in answerToBuy (quantity: noShares)
  const redeemedAmount = noShares * (answers.length - 2)
  const yesBetAmount = betAmount - totalNoAmount + redeemedAmount

  if (yesBetAmount < 0) {
    return undefined
  }
  console.log(
    'totalNoAmount',
    totalNoAmount,
    'noshares',
    noShares,
    'redeemedAmount',
    redeemedAmount,
    'yesBetAmoutn',
    yesBetAmount
  )

  const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
  const yesBetResult = {
    ...computeFills(
      { pool, p: 0.5 },
      'YES',
      yesBetAmount,
      limitProb,
      unfilledBetsByAnswer[answerToBuy.id] ?? [],
      balanceByUserId
    ),
    answer: answerToBuy,
  }

  return { noBetResults, yesBetResult }
}

export function calculateCpmmMultiArbitrageBetNo(
  answers: Answer[],
  answerToBuy: Answer,
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const startTime = Date.now()
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  const yesSharePriceSum = sumBy(
    answers.filter((a) => a.id !== answerToBuy.id),
    'prob'
  )
  const maxYesShares = betAmount / yesSharePriceSum

  const yesShares = binarySearch(0, maxYesShares, (yesShares) => {
    const result = buyYesSharesInOtherAnswersThenNoInAnswer(
      answers,
      answerToBuy,
      unfilledBetsByAnswer,
      balanceByUserId,
      betAmount,
      limitProb,
      yesShares
    )
    if (!result) return 1
    const { yesBetResults, noBetResult } = result
    const newPools = [
      ...yesBetResults.map((r) => r.cpmmState.pool),
      noBetResult.cpmmState.pool,
    ]
    const diff = sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5)) - 1
    return diff
  })

  const result = buyYesSharesInOtherAnswersThenNoInAnswer(
    answers,
    answerToBuy,
    unfilledBetsByAnswer,
    balanceByUserId,
    betAmount,
    limitProb,
    yesShares
  )
  if (!result) {
    throw new Error('Invariant failed in calculateCpmmMultiArbitrageBetNo')
  }
  const { yesBetResults, noBetResult } = result

  const noAmount = sumBy(noBetResult.takers, 'amount')
  const noShares = sumBy(noBetResult.takers, 'shares')
  // Identity: yes shares in every other answer = no shares in this answer.
  const shares = yesShares + noShares
  const newPoolsByAnswerId = Object.fromEntries([
    ...yesBetResults.map((r) => [r.answer.id, r.cpmmState.pool] as const),
    [noBetResult.answer.id, noBetResult.cpmmState.pool] as const,
  ])
  const newPools = Object.values(newPoolsByAnswerId)

  const endTime = Date.now()
  console.log('time', endTime - startTime, 'ms')

  console.log(
    'bet amount',
    betAmount,
    'yes bet amounts',
    yesBetResults.map((r) => r.takers.map((t) => t.amount)),
    'no bet amount',
    noAmount
  )

  console.log(
    'getBinaryBuyYes before',
    answers.map((a) => a.prob),
    answers.map((a) => `${a.poolYes}, ${a.poolNo}`),
    'answerToBuy',
    answerToBuy
  )
  console.log(
    'getBinaryBuyNo after',
    newPools,
    newPools.map((pool) => getCpmmProbability(pool, 0.5)),
    'prob total',
    sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5)),
    'pool shares',
    newPools.map((pool) => `${pool.YES}, ${pool.NO}`),
    'yes shares',
    yesShares,
    'no shares',
    shares
  )
  const newBetResult = { ...noBetResult, outcome: 'NO' }
  const otherBetResults = yesBetResults.map((r) => ({ ...r, outcome: 'YES' }))
  return { newBetResult, otherBetResults, shares, newPoolsByAnswerId }
}

const buyYesSharesInOtherAnswersThenNoInAnswer = (
  answers: Answer[],
  answerToBuy: Answer,
  unfilledBetsByAnswer: Dictionary<LimitBet[]>,
  balanceByUserId: { [userId: string]: number },
  betAmount: number,
  limitProb: number | undefined,
  yesShares: number
) => {
  const otherAnswers = answers.filter((a) => a.id !== answerToBuy.id)
  const yesAmounts = otherAnswers.map(({ id, poolYes, poolNo }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
      yesShares,
      'YES',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
  )
  const totalYesAmount = sum(yesAmounts)

  const yesBetResults = yesAmounts.map((yesAmount, i) => {
    const answer = otherAnswers[i]
    const { poolYes, poolNo } = answer
    return {
      ...computeFills(
        { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
        'YES',
        yesAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId
      ),
      answer,
    }
  })

  const noBetAmount = betAmount - totalYesAmount

  if (noBetAmount < 0) {
    return undefined
  }

  const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
  const noBetResult = {
    ...computeFills(
      { pool, p: 0.5 },
      'NO',
      noBetAmount,
      limitProb,
      unfilledBetsByAnswer[answerToBuy.id] ?? [],
      balanceByUserId
    ),
    answer: answerToBuy,
  }

  return { yesBetResults, noBetResult }
}
