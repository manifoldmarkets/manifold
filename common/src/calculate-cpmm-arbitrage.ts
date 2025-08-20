import { MAX_CPMM_PROB, MIN_CPMM_PROB } from 'common/contract'
import { Dictionary, first, groupBy, mapValues, sum, sumBy } from 'lodash'
import { Answer } from './answer'
import { Bet, LimitBet, maker } from './bet'
import {
  calculateAmountToBuySharesFixedP,
  computeFills,
  getCpmmProbability,
} from './calculate-cpmm'
import { Fees, getFeesSplit, getTakerFee, noFees, sumAllFees } from './fees'
import { binarySearch } from './util/algos'
import { floatingEqual } from './util/math'
import { addObjects } from './util/object'

const DEBUG = false
export type ArbitrageBetArray = ReturnType<typeof combineBetsOnSameAnswers>
const noFillsReturn = (
  outcome: string,
  answer: Answer,
  collectedFees: Fees
) => ({
  newBetResult: {
    outcome,
    answer,
    takers: [],
    makers: [] as maker[],
    ordersToCancel: [] as LimitBet[],
    cpmmState: {
      pool: { YES: answer.poolYes, NO: answer.poolNo },
      p: 0.5,
      collectedFees,
    },
    totalFees: { creatorFee: 0, liquidityFee: 0, platformFee: 0 },
  },
  otherBetResults: [] as ArbitrageBetArray,
})
export function calculateCpmmMultiArbitrageBet(
  answers: Answer[],
  answerToBuy: Answer,
  outcome: 'YES' | 'NO',
  betAmount: number,
  initialLimitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  const limitProb =
    initialLimitProb !== undefined
      ? initialLimitProb
      : outcome === 'YES'
      ? MAX_CPMM_PROB
      : MIN_CPMM_PROB
  if (
    (answerToBuy.prob < MIN_CPMM_PROB && outcome === 'NO') ||
    (answerToBuy.prob > MAX_CPMM_PROB && outcome === 'YES') ||
    // Fixes limit order fills at current price when limitProb is set to a diff price and user has shares to redeem
    (answerToBuy.prob > limitProb && outcome === 'YES') ||
    (answerToBuy.prob < limitProb && outcome === 'NO')
  ) {
    return noFillsReturn(outcome, answerToBuy, collectedFees)
  }
  const result =
    outcome === 'YES'
      ? calculateCpmmMultiArbitrageBetYes(
          answers,
          answerToBuy,
          betAmount,
          limitProb,
          unfilledBets,
          balanceByUserId,
          collectedFees
        )
      : calculateCpmmMultiArbitrageBetNo(
          answers,
          answerToBuy,
          betAmount,
          limitProb,
          unfilledBets,
          balanceByUserId,
          collectedFees
        )
  if (floatingEqual(sumBy(result.newBetResult.takers, 'amount'), 0)) {
    // No trades matched.
    const { outcome, answer } = result.newBetResult
    return noFillsReturn(outcome, answer, collectedFees)
  }
  return result
}

export function calculateCpmmMultiArbitrageYesBets(
  answers: Answer[],
  answersToBuy: Answer[],
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  const result = calculateCpmmMultiArbitrageBetsYes(
    answers,
    answersToBuy,
    betAmount,
    limitProb,
    unfilledBets,
    balanceByUserId,
    collectedFees
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
            collectedFees,
          },
          totalFees: noFees,
        },
        otherBetResults: [],
      }
    })
  }
  return result
}

export type PreliminaryBetResults = ReturnType<typeof computeFills> & {
  answer: Answer
  // iteration index within a multi-buy cycle; 0 is paid with user's amount,
  // >0 iterations are funded by arbitrage extraMana and should be free for the taker.
  iteration?: number
}

// Mutate working state to reflect maker fills and cancellations, so subsequent legs
// cannot reuse the same maker order capacity or balances.
const applyMakersToWorkingState = (
  makers: maker[],
  ordersToCancel: LimitBet[],
  workingUnfilledBetsByAnswer: Dictionary<LimitBet[]>,
  workingBalanceByUserId: { [userId: string]: number }
) => {
  for (const maker of makers) {
    const { bet, amount, shares } = maker
    if (!bet.answerId) {
      throw new Error('Multi-bet has no answerId')
    }
    if (amount > 0) {
      const prev = workingBalanceByUserId[bet.userId]
      if (prev !== undefined) workingBalanceByUserId[bet.userId] = prev - amount
    }
    // Update the bet's filled amount in-place inside our working unfilled bets map
    const arr = workingUnfilledBetsByAnswer[bet.answerId] ?? []
    const idx = arr.findIndex((b) => b.id === bet.id)
    if (idx >= 0) {
      const updated = { ...arr[idx] }
      updated.amount = (updated.amount ?? 0) + amount
      updated.shares = (updated.shares ?? 0) + shares
      arr[idx] = updated
      workingUnfilledBetsByAnswer[bet.answerId] = arr
    }
  }
  if (ordersToCancel.length) {
    const cancelIds = new Set(ordersToCancel.map((b) => b.id))
    for (const [answerId, arr] of Object.entries(workingUnfilledBetsByAnswer)) {
      workingUnfilledBetsByAnswer[answerId] = arr.filter(
        (b) => !cancelIds.has(b.id)
      )
    }
  }
}

function calculateCpmmMultiArbitrageBetsYes(
  initialAnswers: Answer[],
  initialAnswersToBuy: Answer[],
  initialBetAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  // Maintain mutable snapshots of unfilled orders and maker balances across the whole multi-buy
  let workingUnfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)
  let workingBalanceByUserId = { ...balanceByUserId }
  const noBetResults: PreliminaryBetResults[] = []
  const yesBetResults: PreliminaryBetResults[] = []

  let updatedAnswers = initialAnswers
  let amountToBet = initialBetAmount
  let iteration = 0
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
          { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
          yesShares,
          'YES',
          workingUnfilledBetsByAnswer[id] ?? [],
          workingBalanceByUserId
        )
      )

      const totalYesAmount = sum(yesAmounts)
      return totalYesAmount - amountToBet
    })

    const {
      noBuyResults,
      yesBets,
      newUpdatedAnswers,
      updatedUnfilledBetsByAnswer,
      updatedBalanceByUserId,
    } = getBetResultsAndUpdatedAnswers(
      answersToBuy,
      yesAmounts,
      updatedAnswers,
      limitProb,
      // Flatten working unfilled bets for API; it will reconstruct its own map
      Object.values(workingUnfilledBetsByAnswer).flat(),
      workingBalanceByUserId,
      collectedFees
    )
    // Annotate iteration index so we can mark taker fills as free beyond the first.
    yesBets.forEach((r) => ((r as PreliminaryBetResults).iteration = iteration))
    noBuyResults.noBetResults.forEach((r) => (r.iteration = iteration))
    workingUnfilledBetsByAnswer = updatedUnfilledBetsByAnswer
    workingBalanceByUserId = updatedBalanceByUserId
    updatedAnswers = newUpdatedAnswers

    amountToBet = noBuyResults.extraMana
    noBetResults.push(...noBuyResults.noBetResults)
    yesBetResults.push(...yesBets)
    iteration++
  }

  const noBetResultsOnBoughtAnswer = combineBetsOnSameAnswers(
    noBetResults,
    'NO',
    updatedAnswers.filter((r) =>
      initialAnswersToBuy.map((a) => a.id).includes(r.id)
    ),
    collectedFees
  )
  const extraFeesPerBoughtAnswer = Object.fromEntries(
    noBetResultsOnBoughtAnswer.map((r) => [r.answer.id, r.totalFees])
  )

  const newBetResults = combineBetsOnSameAnswers(
    yesBetResults,
    'YES',
    updatedAnswers.filter((a) =>
      initialAnswersToBuy.map((an) => an.id).includes(a.id)
    ),
    collectedFees,
    true,
    extraFeesPerBoughtAnswer
  )
  // TODO: after adding limit orders, we need to keep track of the possible matchedBetIds in the no redemption bets we're throwing away
  const otherBetResults = combineBetsOnSameAnswers(
    noBetResults,
    'NO',
    updatedAnswers.filter(
      (r) => !initialAnswersToBuy.map((a) => a.id).includes(r.id)
    ),
    collectedFees
  )

  return { newBetResults, otherBetResults, updatedAnswers }
}

export const getBetResultsAndUpdatedAnswers = (
  answersToBuy: Answer[],
  yesAmounts: number[],
  updatedAnswers: Answer[],
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees,
  answerIdsWithFees?: string[]
) => {
  // Working maps that will be updated as we simulate each leg to avoid reusing capacity.
  const workingUnfilledBetsByAnswer = groupBy(
    unfilledBets,
    (bet) => bet.answerId
  )
  const workingBalanceByUserId = { ...balanceByUserId }

  const yesBetResultsAndUpdatedAnswers = answersToBuy.map((answerToBuy, i) => {
    const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
    const yesBetResult = {
      ...computeFills(
        { pool, p: 0.5, collectedFees },
        'YES',
        yesAmounts[i],
        limitProb,
        workingUnfilledBetsByAnswer[answerToBuy.id] ?? [],
        workingBalanceByUserId,
        undefined,
        answerIdsWithFees && !answerIdsWithFees?.includes(answerToBuy.id)
      ),
      answer: answerToBuy,
    }

    // Apply the fills to mutate working state for subsequent legs
    applyMakersToWorkingState(
      yesBetResult.makers,
      yesBetResult.ordersToCancel,
      workingUnfilledBetsByAnswer,
      workingBalanceByUserId
    )

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
  })
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
    // Flatten current working snapshot so NO legs see already-used capacity
    Object.values(workingUnfilledBetsByAnswer).flat(),
    workingBalanceByUserId,
    collectedFees,
    answerIdsWithFees
  )
  // Apply NO leg maker fills to working state as well
  for (const noBet of noBuyResults.noBetResults) {
    applyMakersToWorkingState(
      noBet.makers,
      noBet.ordersToCancel,
      workingUnfilledBetsByAnswer,
      workingBalanceByUserId
    )
  }
  // Update new answer states from bets placed on all answers
  const newUpdatedAnswers = noBuyResults.noBetResults.map((noBetResult) => {
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

  return {
    newUpdatedAnswers,
    yesBets,
    noBuyResults,
    // Also return updated state so callers can carry it across iterations
    updatedUnfilledBetsByAnswer: workingUnfilledBetsByAnswer,
    updatedBalanceByUserId: workingBalanceByUserId,
  }
}

export const combineBetsOnSameAnswers = (
  bets: PreliminaryBetResults[],
  outcome: 'YES' | 'NO',
  updatedAnswers: Answer[],
  collectedFees: Fees,
  // The fills after the first are free bc they're due to arbitrage.
  fillsFollowingFirstAreFree?: boolean,
  extraFeesPerAnswer?: { [answerId: string]: Fees }
) => {
  return updatedAnswers.map((answer) => {
    const betsForAnswer = bets.filter((bet) => bet.answer.id === answer.id)
    const { poolYes, poolNo } = answer
    const bet = betsForAnswer[0]
    const extraFees = extraFeesPerAnswer?.[answer.id] ?? noFees
    const totalFees = betsForAnswer.reduce(
      (acc, b) => addObjects(acc, b.totalFees),
      extraFees
    )
    // Make extra taker fills beyond the user's paid iteration free by zeroing their amounts and fees,
    // while still summing shares so probabilities update correctly.
    const takers = betsForAnswer.flatMap((r) => r.takers)
    const adjustedTakers = fillsFollowingFirstAreFree
      ? (() => {
          const cloned = takers.map((t) => ({ ...t }))
          let idx = 0
          for (const r of betsForAnswer) {
            const count = r.takers.length
            const slice = cloned.slice(idx, idx + count)
            if ((r.iteration ?? 0) > 0) {
              for (const t of slice) {
                t.amount = 0
                t.fees = noFees
              }
            }
            idx += count
          }
          return cloned
        })()
      : takers
    return {
      ...bet,
      takers: adjustedTakers,
      makers: betsForAnswer.flatMap((r) => r.makers),
      ordersToCancel: betsForAnswer.flatMap((r) => r.ordersToCancel),
      outcome,
      cpmmState: { p: 0.5, pool: { YES: poolYes, NO: poolNo }, collectedFees },
      answer,
      totalFees,
    }
  })
}

function calculateCpmmMultiArbitrageBetYes(
  answers: Answer[],
  answerToBuy: Answer,
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
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
      noShares,
      collectedFees
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
    noShares,
    collectedFees
  )
  if (!result) {
    console.log('no result', result)
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
  noShares: number,
  collectedFees: Fees
) => {
  const otherAnswers = answers.filter((a) => a.id !== answerToBuy.id)
  const noAmounts = otherAnswers.map(({ id, poolYes, poolNo }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
      noShares,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId,
      true
    )
  )
  const totalNoAmount = sum(noAmounts)

  const noBetResults = noAmounts.map((noAmount, i) => {
    const answer = otherAnswers[i]
    const pool = { YES: answer.poolYes, NO: answer.poolNo }
    return {
      ...computeFills(
        { pool, p: 0.5, collectedFees },
        'NO',
        noAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId,
        undefined,
        true
      ),
      answer,
    }
  })

  // Identity: No shares in all other answers is equal to noShares * (n-2) mana + yes shares in answerToBuy (quantity: noShares)
  const redeemedAmount = noShares * (answers.length - 2)
  const netNoAmount = totalNoAmount - redeemedAmount
  let yesBetAmount = betAmount - netNoAmount
  if (floatingArbitrageEqual(yesBetAmount, 0)) {
    yesBetAmount = 0
  }
  if (yesBetAmount < 0) {
    return undefined
  }

  for (const noBetResult of noBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(noBetResult.takers, 'amount'),
      shares: -sumBy(noBetResult.takers, 'shares'),
      timestamp: Date.now(),
      fees: noFees,
    }
    noBetResult.takers.push(redemptionFill)
  }

  const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
  const yesBetResult = {
    ...computeFills(
      { pool, p: 0.5, collectedFees },
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
    fees: noFees,
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
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
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
      yesShares,
      collectedFees
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
    yesShares,
    collectedFees
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
  yesShares: number,
  collectedFees: Fees
) => {
  const otherAnswers = answers.filter((a) => a.id !== answerToBuy.id)
  const yesAmounts = otherAnswers.map(({ id, poolYes, poolNo }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
      yesShares,
      'YES',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId,
      true
    )
  )
  const totalYesAmount = sum(yesAmounts)

  const yesBetResults = yesAmounts.map((yesAmount, i) => {
    const answer = otherAnswers[i]
    const { poolYes, poolNo } = answer
    return {
      ...computeFills(
        { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
        'YES',
        yesAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId,
        undefined,
        true
      ),
      answer,
    }
  })
  //{"id": "tQudZcEtlp", "slug": "whos-gonna-win-gn8sCuyRpl", "volume": 0, "answers": [{"id": "Ncus9Qtty2", "prob": 0.16666666666666666, "text": "a", "index": 0, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "CAqyQ8AOSn", "prob": 0.16666666666666666, "text": "b", "index": 1, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "Pc86OAUEsn", "prob": 0.16666666666666666, "text": "c", "index": 2, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "dn0gpUIzpq", "prob": 0.16666666666666666, "text": "d", "index": 3, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "uq5uZd5O0A", "prob": 0.16666666666666666, "text": "e", "index": 4, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "ACNE8CLyyS", "prob": 0.16666666666666666, "text": "Other", "index": 5, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": true, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}], "isRanked": false, "question": "Who's gonna win?", "closeTime": 1767254340000, "creatorId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "mechanism": "cpmm-multi-1", "elasticity": 4.99, "groupSlugs": ["nonpredictive"], "isResolved": false, "visibility": "public", "createdTime": 1755714659073, "creatorName": "Ian Bobby", "description": {"type": "doc", "content": [{"type": "paragraph"}]}, "outcomeType": "MULTIPLE_CHOICE", "subsidyPool": 0, "collectedFees": {"creatorFee": 0, "platformFee": 0, "liquidityFee": 0}, "volume24Hours": 0, "addAnswersMode": "ANYONE", "totalLiquidity": 1000, "creatorUsername": "IanPhilip", "lastUpdatedTime": 1755714659519, "popularityScore": 0, "creatorAvatarUrl": "https://firebasestorage.googleapis.com/v0/b/dev-mantic-markets.appspot.com/o/user-images%2FIanPhilip%2FEyIU8AZ2RC.png?alt=media&token=ff41c9e8-21d5-412d-ac19-854a90cce076", "uniqueBettorCount": 0, "creatorCreatedTime": 1668811545000, "uniqueBettorCountDay": 0, "shouldAnswersSumToOne": true}
  let noBetAmount = betAmount - totalYesAmount
  if (floatingArbitrageEqual(noBetAmount, 0)) {
    noBetAmount = 0
  }
  if (noBetAmount < 0) {
    return undefined
  }

  for (const yesBetResult of yesBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(yesBetResult.takers, 'amount'),
      shares: -sumBy(yesBetResult.takers, 'shares'),
      timestamp: Date.now(),
      fees: noFees,
    }
    yesBetResult.takers.push(redemptionFill)
  }

  const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
  const noBetResult = {
    ...computeFills(
      { pool, p: 0.5, collectedFees },
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
    fees: noFees,
  }
  noBetResult.takers.push(redemptionFill)

  return { yesBetResults, noBetResult }
}

export const buyNoSharesUntilAnswersSumToOne = (
  answers: Answer[],
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees,
  answerIdsWithFees?: string[]
) => {
  const baseUnfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  let maxNoShares = 10
  do {
    const result = buyNoSharesInAnswers(
      answers,
      { ...baseUnfilledBetsByAnswer },
      { ...balanceByUserId },
      maxNoShares,
      collectedFees,
      answerIdsWithFees,
      false // don't mutate orders during binary search
    )
    const newPools = result.noBetResults.map((r) => r.cpmmState.pool)
    const probSum = sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
    if (probSum < 1) break
    maxNoShares *= 10
  } while (true)

  const noShares = binarySearch(0, maxNoShares, (noShares) => {
    const result = buyNoSharesInAnswers(
      answers,
      { ...baseUnfilledBetsByAnswer },
      { ...balanceByUserId },
      noShares,
      collectedFees,
      answerIdsWithFees,
      false // don't mutate orders during binary search
    )
    const newPools = result.noBetResults.map((r) => r.cpmmState.pool)
    const diff = 1 - sumBy(newPools, (pool) => getCpmmProbability(pool, 0.5))
    return diff
  })

  return buyNoSharesInAnswers(
    answers,
    baseUnfilledBetsByAnswer,
    { ...balanceByUserId },
    noShares,
    collectedFees,
    answerIdsWithFees,
    true // mutate orders in final execution
  )
}

const buyNoSharesInAnswers = (
  answers: Answer[],
  unfilledBetsByAnswer: Dictionary<LimitBet[]>,
  balanceByUserId: { [userId: string]: number },
  noShares: number,
  collectedFees: Fees,
  answerIdsWithFees?: string[],
  updateOrders: boolean = true
) => {
  // Sequentially compute each answer's NO leg, updating state to avoid reusing capacity.
  let totalNoAmount = 0
  const noBetResults: PreliminaryBetResults[] = []
  for (const answer of answers) {
    const { id, poolYes, poolNo } = answer
    const pool = { YES: poolYes, NO: poolNo }
    const noAmount = calculateAmountToBuySharesFixedP(
      { pool, p: 0.5, collectedFees },
      noShares,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId,
      !answerIdsWithFees?.includes(id)
    )
    totalNoAmount += noAmount

    const res = {
      ...computeFills(
        { pool, p: 0.5, collectedFees },
        'NO',
        noAmount,
        undefined,
        unfilledBetsByAnswer[id] ?? [],
        balanceByUserId,
        undefined,
        !answerIdsWithFees?.includes(id)
      ),
      answer,
    }

    // Apply maker usage to state so later answers don't reuse.
    if (updateOrders) {
      applyMakersToWorkingState(
        res.makers,
        res.ordersToCancel,
        unfilledBetsByAnswer,
        balanceByUserId
      )
    }

    noBetResults.push(res)
  }
  // Identity: No shares in all other answers is equal to noShares * (n-1) mana
  const redeemedAmount = noShares * (answers.length - 1)
  // Fees on arbitrage bets are returned
  const extraMana = redeemedAmount - totalNoAmount

  for (const noBetResult of noBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(noBetResult.takers, 'amount'),
      shares: -sumBy(noBetResult.takers, 'shares'),
      timestamp: Date.now(),
      fees: noBetResult.totalFees,
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
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
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
      { pool, p: 0.5, collectedFees },
      yesShares,
      'YES',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const noAmounts = answersWithoutAnswerToSell.map(
      ({ id, poolYes, poolNo }) =>
        calculateAmountToBuySharesFixedP(
          { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
          noSharesInOtherAnswers,
          'NO',
          unfilledBetsByAnswer[id] ?? [],
          balanceByUserId,
          true
        )
    )

    const yesResult = computeFills(
      { pool, p: 0.5, collectedFees },
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
          { pool, p: 0.5, collectedFees },
          'NO',
          noAmount,
          undefined,
          unfilledBetsByAnswer[answer.id] ?? [],
          balanceByUserId,
          undefined,
          true
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
    { pool, p: 0.5, collectedFees },
    yesShares,
    'YES',
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const noAmounts = answersWithoutAnswerToSell.map(({ id, poolYes, poolNo }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
      noSharesInOtherAnswers,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId,
      true
    )
  )
  const yesBetResult = computeFills(
    { pool, p: 0.5, collectedFees },
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
        { pool, p: 0.5, collectedFees },
        'NO',
        noAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId,
        undefined,
        true
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
      fees: noFees,
    }
    noBetResult.takers.push(redemptionFill)
  }

  const arbitrageFee =
    noSharesInOtherAnswers === 0
      ? 0
      : getTakerFee(
          noSharesInOtherAnswers,
          netNoAmount / noSharesInOtherAnswers
        )
  const arbitrageFees = getFeesSplit(arbitrageFee)
  yesBetResult.takers.push({
    matchedBetId: null,
    amount: netNoAmount + arbitrageFee,
    shares: noSharesInOtherAnswers,
    timestamp: now,
    fees: arbitrageFees,
  })
  yesBetResult.totalFees = addObjects(yesBetResult.totalFees, arbitrageFees)

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
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
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
      { pool, p: 0.5, collectedFees },
      noShares,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const yesAmounts = answersWithoutAnswerToSell.map(
      ({ id, poolYes, poolNo }) =>
        calculateAmountToBuySharesFixedP(
          { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
          yesSharesInOtherAnswers,
          'YES',
          unfilledBetsByAnswer[id] ?? [],
          balanceByUserId,
          true
        )
    )

    const noResult = computeFills(
      { pool, p: 0.5, collectedFees },
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
          { pool, p: 0.5, collectedFees },
          'YES',
          yesAmount,
          undefined,
          unfilledBetsByAnswer[answer.id] ?? [],
          balanceByUserId,
          undefined,
          true
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
    { pool, p: 0.5, collectedFees },
    noShares,
    'NO',
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const yesAmounts = answersWithoutAnswerToSell.map(({ id, poolYes, poolNo }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
      yesSharesInOtherAnswers,
      'YES',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId,
      true
    )
  )
  const noBetResult = computeFills(
    { pool, p: 0.5, collectedFees },
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
        { pool, p: 0.5, collectedFees },
        'YES',
        yesAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId,
        undefined,
        true
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
      fees: noFees,
    }
    yesBetResult.takers.push(redemptionFill)
  }

  const arbitrageFee =
    yesSharesInOtherAnswers === 0
      ? 0
      : getTakerFee(
          yesSharesInOtherAnswers,
          totalYesAmount / yesSharesInOtherAnswers
        )
  const arbitrageFees = getFeesSplit(arbitrageFee)
  noBetResult.takers.push({
    matchedBetId: null,
    amount: totalYesAmount + arbitrageFee,
    shares: yesSharesInOtherAnswers,
    timestamp: now,
    fees: arbitrageFees,
  })
  noBetResult.totalFees = addObjects(noBetResult.totalFees, arbitrageFees)

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

  const newBetResult = {
    ...noBetResult,
    outcome: 'NO',
  }
  const otherBetResults = yesBetResults.map((r) => ({ ...r, outcome: 'YES' }))
  return { newBetResult, otherBetResults }
}

export const calculateCpmmMultiArbitrageSellYesEqually = (
  initialAnswers: Answer[],
  userBetsByAnswerIdToSell: { [answerId: string]: Bet[] },
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) => {
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)
  const allAnswersToSell = initialAnswers.filter(
    (a) => userBetsByAnswerIdToSell[a.id]?.length
  )
  const sharesByAnswerId = mapValues(userBetsByAnswerIdToSell, (bets) =>
    sumBy(bets, (b) => b.shares)
  )
  const minShares = Math.min(...Object.values(sharesByAnswerId))
  const saleBetResults: PreliminaryBetResults[] = []
  const oppositeBuyResults: PreliminaryBetResults[] = []
  let updatedAnswers = initialAnswers
  let sharesToSell = minShares
  while (sharesToSell > 0) {
    const answersToSellNow = allAnswersToSell.filter(
      (a) => sharesByAnswerId[a.id] >= sharesToSell
    )
    const answerIdsToSellNow = allAnswersToSell
      .filter((a) => sharesByAnswerId[a.id] >= sharesToSell)
      .map((a) => a.id)
    // Buy yes shares in the answers opposite the answers to sell
    const oppositeAnswersFromSaleToBuyYesShares = updatedAnswers.filter(
      (a) => !answerIdsToSellNow.includes(a.id)
    )
    let saleBets: PreliminaryBetResults[]
    if (answersToSellNow.length !== initialAnswers.length) {
      const yesAmounts = oppositeAnswersFromSaleToBuyYesShares.map(
        ({ id, poolYes, poolNo }) => {
          return calculateAmountToBuySharesFixedP(
            { pool: { YES: poolYes, NO: poolNo }, p: 0.5, collectedFees },
            sharesToSell,
            'YES',
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId,
            // Zero fees on arbitrage bets
            true
          )
        }
      )
      const { newUpdatedAnswers, yesBets, noBuyResults } =
        getBetResultsAndUpdatedAnswers(
          oppositeAnswersFromSaleToBuyYesShares,
          yesAmounts,
          updatedAnswers,
          undefined,
          unfilledBets,
          balanceByUserId,
          collectedFees,
          // Charge fees on sale bets
          answerIdsToSellNow
        )
      updatedAnswers = newUpdatedAnswers
      for (const yesBet of yesBets) {
        const redemptionFill = {
          matchedBetId: null,
          amount: -sumBy(yesBet.takers, 'amount'),
          shares: -sumBy(yesBet.takers, 'shares'),
          timestamp: first(yesBet.takers)?.timestamp ?? Date.now(),
          fees: yesBet.totalFees,
        }
        yesBet.takers.push(redemptionFill)
      }
      oppositeBuyResults.push(...yesBets)
      const totalYesAmount = sum(yesAmounts)
      const { noBetResults, extraMana } = noBuyResults
      saleBets = noBetResults
        // TODO: after adding limit orders, we need to keep track of the matchedBetIds in the redemption bets we're throwing away
        .filter((betResult) => answerIdsToSellNow.includes(betResult.answer.id))
        .map((betResult) => {
          const answer = updatedAnswers.find(
            (a) => a.id === betResult.answer.id
          )!
          const { poolYes, poolNo } = answer
          return {
            ...betResult,
            takers: [
              {
                matchedBetId: null,
                amount:
                  -(sharesToSell - totalYesAmount + extraMana) /
                  answerIdsToSellNow.length,
                shares: -sharesToSell,
                timestamp: first(betResult.takers)?.timestamp ?? Date.now(),
                isSale: true,
                fees: betResult.totalFees,
              },
              //...betResult.takers, these are takers in the opposite outcome, not sure where to put them
            ],
            cpmmState: {
              p: 0.5,
              pool: { YES: poolYes, NO: poolNo },
              collectedFees,
            },
            answer,
          }
        })
    } else {
      // If we have yes shares in ALL answers, redeem them for mana
      saleBets = getSellAllRedemptionPreliminaryBets(
        answersToSellNow,
        sharesToSell,
        collectedFees,
        Date.now()
      )
    }
    saleBetResults.push(...saleBets)
    for (const answerIdToSell of answerIdsToSellNow) {
      sharesByAnswerId[answerIdToSell] -= sharesToSell
    }
    const answersToSellRemaining = Object.values(sharesByAnswerId).filter(
      (shares) => shares > 0
    )
    if (answersToSellRemaining.length === 0) break
    sharesToSell = Math.min(...answersToSellRemaining)
  }

  const newBetResults = combineBetsOnSameAnswers(
    saleBetResults,
    'YES',
    updatedAnswers.filter((a) =>
      allAnswersToSell.map((an) => an.id).includes(a.id)
    ),
    collectedFees
  )

  const otherBetResults = combineBetsOnSameAnswers(
    oppositeBuyResults,
    'YES',
    updatedAnswers.filter(
      (r) => !allAnswersToSell.map((a) => a.id).includes(r.id)
    ),
    collectedFees
  )
  const totalFee = sumAllFees(
    newBetResults.concat(otherBetResults).map((r) => r.totalFees)
  )

  return { newBetResults, otherBetResults, updatedAnswers, totalFee }
}

export const getSellAllRedemptionPreliminaryBets = (
  answers: Answer[],
  sharesToSell: number,
  collectedFees: Fees,
  now: number
) => {
  return answers.map((answer) => {
    const { poolYes, poolNo } = answer
    return {
      outcome: 'YES' as const,
      takers: [
        {
          matchedBetId: null,
          amount: -sharesToSell / answers.length,
          shares: -sharesToSell,
          timestamp: now,
          isSale: true,
          fees: noFees,
        },
      ],
      makers: [],
      totalFees: noFees,
      cpmmState: { p: 0.5, pool: { YES: poolYes, NO: poolNo }, collectedFees },
      ordersToCancel: [],
      answer,
    }
  })
}

export function floatingArbitrageEqual(a: number, b: number, epsilon = 0.001) {
  return Math.abs(a - b) < epsilon
}
