import { Dictionary, groupBy, sum, sumBy } from 'lodash'
import { Answer } from './answer'
import { LimitBet } from './bet'
import {
  calculateAmountToBuySharesFixedP,
  getCpmmProbability,
} from './calculate-cpmm'
import { binarySearch } from './util/algos'
import { computeFills } from './new-bet'
import { floatingEqual } from './util/math'

const DEBUG = false

export function calculateCpmmMultiArbitrageBet(
  answers: Answer[],
  answerToBuy: Answer,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const result =
    outcome === 'YES'
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
  if (floatingEqual(sumBy(result.newBetResult.takers, 'amount'), 0)) {
    // No trades matched.
    const { outcome, answer } = result.newBetResult
    return {
      newBetResult: {
        outcome,
        answer,
        takers: [],
        makers: [],
        ordersToCancel: [],
        cpmmState: { pool: { YES: answer.poolYes, NO: answer.poolNo }, p: 0.5 },
      },
      otherBetResults: [] as ReturnType<typeof combineBetsOnSameAnswers>,
    }
  }
  return result
}

export function calculateCpmmMultiArbitrageBets(
  answers: Answer[],
  answersToBuy: Answer[],
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const result =
    outcome === 'YES'
      ? calculateCpmmMultiArbitrageBetsYes(
          answers,
          answersToBuy,
          betAmount,
          limitProb,
          unfilledBets,
          balanceByUserId
        )
      : calculateCpmmMultiArbitrageBetsYes(
          answers,
          answersToBuy,
          betAmount,
          limitProb,
          unfilledBets,
          balanceByUserId
        )
  if (
    floatingEqual(
      sumBy(
        result.newBetResults.map((r) => r.takers),
        'amount'
      ),
      0
    )
  ) {
    // No trades matched.
    result.newBetResults.map((r) => {
      return {
        newBetResult: {
          outcome: r.outcome,
          answer: r.answer,
          takers: [],
          makers: [],
          ordersToCancel: [],
          cpmmState: {
            pool: { YES: r.answer.poolYes, NO: r.answer.poolNo },
            p: 0.5,
          },
        },
        otherBetResults: [],
      }
    })
  }
  return result
}

export type PreliminaryBetResults = ReturnType<typeof computeFills> & {
  answer: Answer
}
function calculateCpmmMultiArbitrageBetsYes(
  initialAnswers: Answer[],
  initialAnswersToBuy: Answer[],
  initialBetAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)
  const noBetResults: PreliminaryBetResults[] = []
  const yesBetResults: PreliminaryBetResults[] = []

  let updatedAnswers = initialAnswers
  let amountToBet = initialBetAmount
  while (amountToBet > 0.01) {
    const answersToBuy = updatedAnswers.filter((a) =>
      initialAnswersToBuy.map((an) => an.id).includes(a.id)
    )
    // buy equal number of shares in each answer
    const yesSharePriceSum = sumBy(answersToBuy, 'prob')
    const maxYesShares = amountToBet / yesSharePriceSum
    let yesAmounts: number[] = []
    binarySearch(0, maxYesShares, (yesShares) => {
      yesAmounts = answersToBuy.map(({ id, poolYes, poolNo }) =>
        calculateAmountToBuySharesFixedP(
          { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
          yesShares,
          'YES',
          unfilledBetsByAnswer[id] ?? [],
          balanceByUserId
        )
      )

      const totalYesAmount = sum(yesAmounts)
      return totalYesAmount - amountToBet
    })
    const yesBetResultsAndUpdatedAnswers = answersToBuy.map(
      (answerToBuy, i) => {
        const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
        const yesBetResult = {
          ...computeFills(
            { pool, p: 0.5 },
            'YES',
            yesAmounts[i],
            limitProb,
            unfilledBetsByAnswer[answerToBuy.id] ?? [],
            balanceByUserId
          ),
          answer: answerToBuy,
        }

        const { cpmmState } = yesBetResult
        const { pool: newPool, p } = cpmmState
        const { YES: poolYes, NO: poolNo } = newPool
        const prob = getCpmmProbability(newPool, p)
        const newAnswerState = {
          ...answerToBuy,
          poolYes,
          poolNo,
          prob,
        }
        return { yesBetResult, newAnswerState }
      }
    )
    const yesBets = yesBetResultsAndUpdatedAnswers.map((r) => r.yesBetResult)
    const newAnswerStates = yesBetResultsAndUpdatedAnswers.map(
      (r) => r.newAnswerState
    )
    const noBuyResults = buyNoSharesUntilAnswersSumToOne(
      updatedAnswers.map(
        (answer) =>
          newAnswerStates.find(
            (newAnswerState) => newAnswerState.id === answer.id
          ) ?? answer
      ),
      unfilledBets,
      balanceByUserId
    )
    // Update new answer states from the no bets (placed on all answers)
    updatedAnswers = noBuyResults.noBetResults.map((noBetResult) => {
      const { cpmmState } = noBetResult
      const { pool: newPool, p } = cpmmState
      const { YES: poolYes, NO: poolNo } = newPool
      const prob = getCpmmProbability(newPool, p)
      return {
        ...noBetResult.answer,
        poolYes,
        poolNo,
        prob,
      }
    })

    amountToBet = noBuyResults.extraMana
    noBetResults.push(...noBuyResults.noBetResults)
    yesBetResults.push(...yesBets)
  }

  const newBetResults = combineBetsOnSameAnswers(
    yesBetResults,
    'YES',
    updatedAnswers.filter((a) =>
      initialAnswersToBuy.map((an) => an.id).includes(a.id)
    )
  )

  const otherBetResults = combineBetsOnSameAnswers(
    noBetResults,
    'NO',
    updatedAnswers
  )

  return { newBetResults, otherBetResults }
}

export const combineBetsOnSameAnswers = (
  bets: PreliminaryBetResults[],
  outcome: 'YES' | 'NO',
  answers: Answer[]
) => {
  return answers.map((answer) => {
    const betsForAnswer = bets.filter((bet) => bet.answer.id === answer.id)
    return {
      ...betsForAnswer[betsForAnswer.length - 1],
      takers: betsForAnswer.flatMap((r) => r.takers),
      makers: betsForAnswer.flatMap((r) => r.makers),
      outcome,
      answer,
    }
  })
}

function calculateCpmmMultiArbitrageBetYes(
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
  // If you spend all of amount on NO shares at current price. Subtract out from the price the redemption mana.
  const maxNoShares = betAmount / (noSharePriceSum - answers.length + 2)

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

  if (DEBUG) {
    const endTime = Date.now()

    const newPools = [
      ...noBetResults.map((r) => r.cpmmState.pool),
      yesBetResult.cpmmState.pool,
    ]

    console.log('time', endTime - startTime, 'ms')

    console.log(
      'bet amount',
      betAmount,
      'no bet amounts',
      noBetResults.map((r) => r.takers.map((t) => t.amount)),
      'yes bet amount',
      sumBy(yesBetResult.takers, 'amount')
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
      sumBy(yesBetResult.takers, 'shares')
    )
  }

  const newBetResult = { ...yesBetResult, outcome: 'YES' }
  const otherBetResults = noBetResults.map((r) => ({ ...r, outcome: 'NO' }))
  return { newBetResult, otherBetResults }
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
  const netNoAmount = totalNoAmount - redeemedAmount
  const yesBetAmount = betAmount - netNoAmount

  if (yesBetAmount < 0) {
    return undefined
  }
  for (const noBetResult of noBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(noBetResult.takers, 'amount'),
      shares: -sumBy(noBetResult.takers, 'shares'),
      timestamp: Date.now(),
    }
    noBetResult.takers.push(redemptionFill)
  }

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

  // Redeem NO shares in other answers to YES shares in this answer.
  const redemptionFill = {
    matchedBetId: null,
    amount: netNoAmount,
    shares: noShares,
    timestamp: Date.now(),
  }
  yesBetResult.takers.push(redemptionFill)

  return { noBetResults, yesBetResult }
}

function calculateCpmmMultiArbitrageBetNo(
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

  if (DEBUG) {
    const endTime = Date.now()

    const newPools = [
      ...yesBetResults.map((r) => r.cpmmState.pool),
      noBetResult.cpmmState.pool,
    ]

    console.log('time', endTime - startTime, 'ms')

    console.log(
      'bet amount',
      betAmount,
      'yes bet amounts',
      yesBetResults.map((r) => r.takers.map((t) => t.amount)),
      'no bet amount',
      sumBy(noBetResult.takers, 'amount')
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
      sumBy(noBetResult.takers, 'shares')
    )
  }

  const newBetResult = { ...noBetResult, outcome: 'NO' }
  const otherBetResults = yesBetResults.map((r) => ({ ...r, outcome: 'YES' }))
  return { newBetResult, otherBetResults }
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
  for (const yesBetResult of yesBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(yesBetResult.takers, 'amount'),
      shares: -sumBy(yesBetResult.takers, 'shares'),
      timestamp: Date.now(),
    }
    yesBetResult.takers.push(redemptionFill)
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
  // Redeem YES shares in other answers to NO shares in this answer.
  const redemptionFill = {
    matchedBetId: null,
    amount: totalYesAmount,
    shares: yesShares,
    timestamp: Date.now(),
  }
  noBetResult.takers.push(redemptionFill)

  return { yesBetResults, noBetResult }
}

export const buyNoSharesUntilAnswersSumToOne = (
  answers: Answer[],
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  let maxNoShares = 10
  do {
    const result = buyNoSharesInAnswers(
      answers,
      unfilledBetsByAnswer,
      balanceByUserId,
      maxNoShares
    )
    const newPools = result.noBetResults.map((r) => r.cpmmState.pool)
    const probSum = sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
    if (probSum < 1) break
    maxNoShares *= 10
  } while (true)

  const noShares = binarySearch(0, maxNoShares, (noShares) => {
    const result = buyNoSharesInAnswers(
      answers,
      unfilledBetsByAnswer,
      balanceByUserId,
      noShares
    )
    const newPools = result.noBetResults.map((r) => r.cpmmState.pool)
    const diff = 1 - sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
    return diff
  })

  return buyNoSharesInAnswers(
    answers,
    unfilledBetsByAnswer,
    balanceByUserId,
    noShares
  )
}

const buyNoSharesInAnswers = (
  answers: Answer[],
  unfilledBetsByAnswer: Dictionary<LimitBet[]>,
  balanceByUserId: { [userId: string]: number },
  noShares: number
) => {
  const noAmounts = answers.map(({ id, poolYes, poolNo }) =>
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
    const answer = answers[i]
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

  // Identity: No shares in all other answers is equal to noShares * (n-1) mana
  const redeemedAmount = noShares * (answers.length - 1)
  const extraMana = redeemedAmount - totalNoAmount

  for (const noBetResult of noBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(noBetResult.takers, 'amount'),
      shares: -sumBy(noBetResult.takers, 'shares'),
      timestamp: Date.now(),
    }
    noBetResult.takers.push(redemptionFill)
  }

  return { noBetResults, extraMana }
}

export function calculateCpmmMultiArbitrageSellNo(
  answers: Answer[],
  answerToSell: Answer,
  noShares: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const startTime = Date.now()
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  const { id, poolYes, poolNo } = answerToSell
  const pool = { YES: poolYes, NO: poolNo }
  const answersWithoutAnswerToSell = answers.filter(
    (a) => a.id !== answerToSell.id
  )

  // Strategy: We have noShares, and need that many yes shares to complete the sell.
  // We buy some yes shares in the answer directly, and the rest is from converting No shares of all the other answers.
  // The proportion of each is dependent on what leaves the final probability sum at 1.
  // Which is what this binary search is discovering.
  const yesShares = binarySearch(0, noShares, (yesShares) => {
    const noSharesInOtherAnswers = noShares - yesShares
    const yesAmount = calculateAmountToBuySharesFixedP(
      { pool, p: 0.5 },
      yesShares,
      'YES',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const noAmounts = answersWithoutAnswerToSell.map(
      ({ id, poolYes, poolNo }) =>
        calculateAmountToBuySharesFixedP(
          { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
          noSharesInOtherAnswers,
          'NO',
          unfilledBetsByAnswer[id] ?? [],
          balanceByUserId
        )
    )

    const yesResult = computeFills(
      { pool, p: 0.5 },
      'YES',
      yesAmount,
      limitProb,
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const noResults = answersWithoutAnswerToSell.map((answer, i) => {
      const noAmount = noAmounts[i]
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

    const newPools = [
      yesResult.cpmmState.pool,
      ...noResults.map((r) => r.cpmmState.pool),
    ]
    const diff = sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5)) - 1
    return diff
  })

  const noSharesInOtherAnswers = noShares - yesShares
  const yesAmount = calculateAmountToBuySharesFixedP(
    { pool, p: 0.5 },
    yesShares,
    'YES',
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const noAmounts = answersWithoutAnswerToSell.map(({ id, poolYes, poolNo }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
      noSharesInOtherAnswers,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
  )
  const yesBetResult = computeFills(
    { pool, p: 0.5 },
    'YES',
    yesAmount,
    limitProb,
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const noBetResults = answersWithoutAnswerToSell.map((answer, i) => {
    const noAmount = noAmounts[i]
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

  const redeemedMana = noSharesInOtherAnswers * (answers.length - 2)
  const netNoAmount = sum(noAmounts) - redeemedMana

  const now = Date.now()
  for (const noBetResult of noBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(noBetResult.takers, 'amount'),
      shares: -sumBy(noBetResult.takers, 'shares'),
      timestamp: now,
    }
    noBetResult.takers.push(redemptionFill)
  }

  yesBetResult.takers.push({
    matchedBetId: null,
    amount: netNoAmount,
    shares: noSharesInOtherAnswers,
    timestamp: now,
  })

  if (DEBUG) {
    const endTime = Date.now()

    const newPools = [
      ...noBetResults.map((r) => r.cpmmState.pool),
      yesBetResult.cpmmState.pool,
    ]

    console.log('time', endTime - startTime, 'ms')

    console.log(
      'no shares to sell',
      noShares,
      'no bet amounts',
      noBetResults.map((r) => r.takers.map((t) => t.amount)),
      'yes bet amount',
      sumBy(yesBetResult.takers, 'amount')
    )

    console.log(
      'getBinaryBuyYes before',
      answers.map((a) => a.prob),
      answers.map((a) => `${a.poolYes}, ${a.poolNo}`),
      'answerToBuy',
      answerToSell
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
      sumBy(yesBetResult.takers, 'shares')
    )
  }

  const newBetResult = { ...yesBetResult, outcome: 'YES' }
  const otherBetResults = noBetResults.map((r) => ({ ...r, outcome: 'NO' }))
  return { newBetResult, otherBetResults }
}

export function calculateCpmmMultiArbitrageSellYes(
  answers: Answer[],
  answerToSell: Answer,
  yesShares: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const startTime = Date.now()
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  const { id, poolYes, poolNo } = answerToSell
  const pool = { YES: poolYes, NO: poolNo }
  const answersWithoutAnswerToSell = answers.filter(
    (a) => a.id !== answerToSell.id
  )

  const noShares = binarySearch(0, yesShares, (noShares) => {
    const yesSharesInOtherAnswers = yesShares - noShares
    const noAmount = calculateAmountToBuySharesFixedP(
      { pool, p: 0.5 },
      noShares,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const yesAmounts = answersWithoutAnswerToSell.map(
      ({ id, poolYes, poolNo }) =>
        calculateAmountToBuySharesFixedP(
          { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
          yesSharesInOtherAnswers,
          'YES',
          unfilledBetsByAnswer[id] ?? [],
          balanceByUserId
        )
    )

    const noResult = computeFills(
      { pool, p: 0.5 },
      'NO',
      noAmount,
      limitProb,
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const yesResults = answersWithoutAnswerToSell.map((answer, i) => {
      const yesAmount = yesAmounts[i]
      const pool = { YES: answer.poolYes, NO: answer.poolNo }
      return {
        ...computeFills(
          { pool, p: 0.5 },
          'YES',
          yesAmount,
          undefined,
          unfilledBetsByAnswer[answer.id] ?? [],
          balanceByUserId
        ),
        answer,
      }
    })

    const newPools = [
      noResult.cpmmState.pool,
      ...yesResults.map((r) => r.cpmmState.pool),
    ]
    const diff = 1 - sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
    return diff
  })

  const yesSharesInOtherAnswers = yesShares - noShares
  const noAmount = calculateAmountToBuySharesFixedP(
    { pool, p: 0.5 },
    noShares,
    'NO',
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const yesAmounts = answersWithoutAnswerToSell.map(({ id, poolYes, poolNo }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p: 0.5 },
      yesSharesInOtherAnswers,
      'YES',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
  )
  const noBetResult = computeFills(
    { pool, p: 0.5 },
    'NO',
    noAmount,
    limitProb,
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const yesBetResults = answersWithoutAnswerToSell.map((answer, i) => {
    const yesAmount = yesAmounts[i]
    const pool = { YES: answer.poolYes, NO: answer.poolNo }
    return {
      ...computeFills(
        { pool, p: 0.5 },
        'YES',
        yesAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId
      ),
      answer,
    }
  })

  const totalYesAmount = sum(yesAmounts)

  const now = Date.now()
  for (const yesBetResult of yesBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(yesBetResult.takers, 'amount'),
      shares: -sumBy(yesBetResult.takers, 'shares'),
      timestamp: now,
    }
    yesBetResult.takers.push(redemptionFill)
  }

  noBetResult.takers.push({
    matchedBetId: null,
    amount: totalYesAmount,
    shares: yesSharesInOtherAnswers,
    timestamp: now,
  })

  if (DEBUG) {
    const endTime = Date.now()

    const newPools = [
      ...yesBetResults.map((r) => r.cpmmState.pool),
      noBetResult.cpmmState.pool,
    ]

    console.log('time', endTime - startTime, 'ms')

    console.log(
      'no shares to sell',
      noShares,
      'no bet amounts',
      yesBetResults.map((r) => r.takers.map((t) => t.amount)),
      'yes bet amount',
      sumBy(noBetResult.takers, 'amount')
    )

    console.log(
      'getBinaryBuyYes before',
      answers.map((a) => a.prob),
      answers.map((a) => `${a.poolYes}, ${a.poolNo}`),
      'answerToBuy',
      answerToSell
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
      sumBy(noBetResult.takers, 'shares')
    )
  }

  const newBetResult = { ...noBetResult, outcome: 'NO' }
  const otherBetResults = yesBetResults.map((r) => ({ ...r, outcome: 'YES' }))
  return { newBetResult, otherBetResults }
}
