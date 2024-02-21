import { sortBy, sumBy } from 'lodash'

import { Bet, fill, LimitBet } from './bet'
import { calculateDpmShares, getDpmOutcomeProbability } from './calculate-dpm'
import {
  calculateCpmmAmountToProb,
  calculateCpmmPurchase,
  CpmmState,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  CPMMBinaryContract,
  CPMMMultiContract,
  DPMContract,
  PseudoNumericContract,
  StonkContract,
} from './contract'
import { noFees } from './fees'
import { addObjects, removeUndefinedProps } from './util/object'
import {
  floatingEqual,
  floatingGreaterEqual,
  floatingLesserEqual,
} from './util/math'
import { Answer } from './answer'
import {
  buyNoSharesUntilAnswersSumToOne,
  calculateCpmmMultiArbitrageBet,
  calculateCpmmMultiArbitrageBets,
  combineBetsOnSameAnswers,
} from './calculate-cpmm-arbitrage'
import { APIError } from 'common/api/utils'

export type CandidateBet<T extends Bet = Bet> = Omit<
  T,
  'id' | 'userId' | 'userAvatarUrl' | 'userName' | 'userUsername'
>
export type BetInfo = {
  newBet: CandidateBet
  newPool?: { [outcome: string]: number }
  newTotalShares?: { [outcome: string]: number }
  newTotalBets?: { [outcome: string]: number }
  newTotalLiquidity?: number
  newP?: number
}

const computeFill = (
  amount: number,
  outcome: 'YES' | 'NO',
  limitProb: number | undefined,
  cpmmState: CpmmState,
  matchedBet: LimitBet | undefined,
  matchedBetUserBalance: number | undefined
) => {
  const prob = getCpmmProbability(cpmmState.pool, cpmmState.p)

  if (
    limitProb !== undefined &&
    (outcome === 'YES'
      ? floatingGreaterEqual(prob, limitProb) &&
        (matchedBet?.limitProb ?? 1) > limitProb
      : floatingLesserEqual(prob, limitProb) &&
        (matchedBet?.limitProb ?? 0) < limitProb)
  ) {
    // No fill.
    return undefined
  }

  const timestamp = Date.now()

  if (
    !matchedBet ||
    (outcome === 'YES'
      ? !floatingGreaterEqual(prob, matchedBet.limitProb)
      : !floatingLesserEqual(prob, matchedBet.limitProb))
  ) {
    // Fill from pool.
    const limit = !matchedBet
      ? limitProb
      : outcome === 'YES'
      ? Math.min(matchedBet.limitProb, limitProb ?? 1)
      : Math.max(matchedBet.limitProb, limitProb ?? 0)

    const buyAmount =
      limit === undefined
        ? amount
        : Math.min(amount, calculateCpmmAmountToProb(cpmmState, limit, outcome))

    const { shares, newPool, newP, fees } = calculateCpmmPurchase(
      cpmmState,
      buyAmount,
      outcome
    )
    const newState = { pool: newPool, p: newP }

    return {
      maker: {
        matchedBetId: null,
        shares,
        amount: buyAmount,
        state: newState,
        fees,
        timestamp,
      },
      taker: {
        matchedBetId: null,
        shares,
        amount: buyAmount,
        timestamp,
      },
    }
  }

  // Fill from matchedBet.
  const amountRemaining = matchedBet.orderAmount - matchedBet.amount
  const matchableUserBalance =
    matchedBetUserBalance && matchedBetUserBalance < 0
      ? 0
      : matchedBetUserBalance
  const amountToFill = Math.min(
    amountRemaining,
    matchableUserBalance ?? amountRemaining
  )
  const shares = Math.min(
    amount /
      (outcome === 'YES' ? matchedBet.limitProb : 1 - matchedBet.limitProb),
    amountToFill /
      (outcome === 'YES' ? 1 - matchedBet.limitProb : matchedBet.limitProb)
  )

  const maker = {
    bet: matchedBet,
    matchedBetId: 'taker',
    amount:
      shares *
      (outcome === 'YES' ? 1 - matchedBet.limitProb : matchedBet.limitProb),
    shares,
    timestamp,
  }
  const taker = {
    matchedBetId: matchedBet.id,
    amount:
      shares *
      (outcome === 'YES' ? matchedBet.limitProb : 1 - matchedBet.limitProb),
    shares,
    timestamp,
  }
  return { maker, taker }
}

export const computeFills = (
  state: CpmmState,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number | undefined }
) => {
  if (isNaN(betAmount)) {
    throw new Error('Invalid bet amount: ${betAmount}')
  }
  if (isNaN(limitProb ?? 0)) {
    throw new Error('Invalid limitProb: ${limitProb}')
  }
  const now = Date.now()

  const sortedBets = sortBy(
    unfilledBets.filter(
      (bet) =>
        bet.outcome !== outcome && (bet.expiresAt ? bet.expiresAt > now : true)
    ),
    (bet) => (outcome === 'YES' ? bet.limitProb : -bet.limitProb),
    (bet) => bet.createdTime
  )

  const takers: fill[] = []
  const makers: {
    bet: LimitBet
    amount: number
    shares: number
    timestamp: number
  }[] = []
  const ordersToCancel: LimitBet[] = []

  let amount = betAmount
  let cpmmState = { pool: state.pool, p: state.p }
  let totalFees = noFees
  const currentBalanceByUserId = { ...balanceByUserId }

  let i = 0
  while (true) {
    const matchedBet: LimitBet | undefined = sortedBets[i]
    const fill = computeFill(
      amount,
      outcome,
      limitProb,
      cpmmState,
      matchedBet,
      currentBalanceByUserId[matchedBet?.userId ?? '']
    )
    if (!fill) break

    const { taker, maker } = fill

    if (maker.matchedBetId === null) {
      // Matched against pool.
      cpmmState = maker.state
      totalFees = addObjects(totalFees, maker.fees)
      takers.push(taker)
    } else {
      // Matched against bet.
      i++
      const { userId } = maker.bet
      const makerBalance = currentBalanceByUserId[userId]
      if (makerBalance !== undefined) {
        if (maker.amount > 0) {
          currentBalanceByUserId[userId] = makerBalance - maker.amount
        }
        const adjustedMakerBalance = currentBalanceByUserId[userId]
        if (adjustedMakerBalance !== undefined && adjustedMakerBalance <= 0) {
          // Now they've insufficient balance. Cancel maker bet.
          ordersToCancel.push(maker.bet)
        }
      }
      if (floatingEqual(maker.amount, 0)) continue

      takers.push(taker)
      makers.push(maker)
    }

    amount -= taker.amount

    if (floatingEqual(amount, 0)) break
  }

  return { takers, makers, totalFees, cpmmState, ordersToCancel }
}

export const computeCpmmBet = (
  cpmmState: CpmmState,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const {
    takers,
    makers,
    cpmmState: afterCpmmState,
    ordersToCancel,
  } = computeFills(
    cpmmState,
    outcome,
    betAmount,
    limitProb,
    unfilledBets,
    balanceByUserId
  )
  const probBefore = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const probAfter = getCpmmProbability(afterCpmmState.pool, afterCpmmState.p)

  const takerAmount = sumBy(takers, 'amount')
  const takerShares = sumBy(takers, 'shares')
  const isFilled = floatingEqual(betAmount, takerAmount)

  return {
    orderAmount: betAmount,
    amount: takerAmount,
    shares: takerShares,
    isFilled,
    fills: takers,
    probBefore,
    probAfter,
    makers,
    ordersToCancel,
    ...afterCpmmState,
  }
}

export const getBinaryCpmmBetInfo = (
  contract: CPMMBinaryContract | PseudoNumericContract | StonkContract,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number
) => {
  const cpmmState = { pool: contract.pool, p: contract.p }
  const {
    orderAmount,
    amount,
    shares,
    isFilled,
    fills,
    probBefore,
    probAfter,
    makers,
    ordersToCancel,
    pool,
    p,
  } = computeCpmmBet(
    cpmmState,
    outcome,
    betAmount,
    limitProb,
    unfilledBets,
    balanceByUserId
  )
  const newBet: CandidateBet = removeUndefinedProps({
    orderAmount,
    amount,
    shares,
    limitProb,
    isFilled,
    isCancelled: false,
    fills,
    contractId: contract.id,
    outcome,
    probBefore,
    probAfter,
    loanAmount: 0,
    createdTime: Date.now(),
    fees: noFees,
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
    visibility: contract.visibility,
    expiresAt,
  })

  return {
    newBet,
    newPool: pool,
    newP: p,
    makers,
    ordersToCancel,
  }
}

export const getNewMultiBetInfo = (
  outcome: string,
  amount: number,
  contract: DPMContract
) => {
  const { pool, totalShares, totalBets } = contract

  const prevOutcomePool = pool[outcome] ?? 0
  const newPool = { ...pool, [outcome]: prevOutcomePool + amount }

  const shares = calculateDpmShares(contract.totalShares, amount, outcome)

  const prevShares = totalShares[outcome] ?? 0
  const newTotalShares = { ...totalShares, [outcome]: prevShares + shares }

  const prevTotalBets = totalBets[outcome] ?? 0
  const newTotalBets = { ...totalBets, [outcome]: prevTotalBets + amount }

  const probBefore = getDpmOutcomeProbability(totalShares, outcome)
  const probAfter = getDpmOutcomeProbability(newTotalShares, outcome)

  const newBet: CandidateBet = {
    contractId: contract.id,
    amount,
    loanAmount: 0,
    shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    fees: noFees,
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
    visibility: contract.visibility,
  }

  return { newBet, newPool, newTotalShares, newTotalBets }
}

export const getNewMultiCpmmBetInfo = (
  contract: CPMMMultiContract,
  answers: Answer[],
  answer: Answer,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number
) => {
  if (contract.shouldAnswersSumToOne) {
    return getNewMultiCpmmBetsInfoSumsToOne(
      contract,
      answers,
      [answer],
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      expiresAt
    )[0]
  }

  const { poolYes, poolNo } = answer
  const pool = { YES: poolYes, NO: poolNo }
  const cpmmState = { pool, p: 0.5 }

  const answerUnfilledBets = unfilledBets.filter(
    (b) => b.answerId === answer.id
  )

  const {
    amount,
    fills,
    isFilled,
    makers,
    ordersToCancel,
    probAfter,
    probBefore,
    shares,
    pool: newPool,
  } = computeCpmmBet(
    cpmmState,
    outcome,
    betAmount,
    limitProb,
    answerUnfilledBets,
    balanceByUserId
  )

  const newBet: CandidateBet = removeUndefinedProps({
    contractId: contract.id,
    outcome,
    orderAmount: betAmount,
    limitProb,
    isCancelled: false,
    amount,
    loanAmount: 0,
    shares,
    answerId: answer.id,
    fills,
    isFilled,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    fees: noFees,
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
    visibility: contract.visibility,
    expiresAt,
  })

  return { newBet, newPool, makers, ordersToCancel }
}

export const getNewMultiCpmmBetsInfo = (
  contract: CPMMMultiContract,
  answers: Answer[],
  answersToBuy: Answer[],
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number,
  equalShares: boolean = true
) => {
  if (!equalShares) {
    throw new APIError(400, 'Not yet implemented')
  }
  if (contract.shouldAnswersSumToOne) {
    return getNewMultiCpmmBetsInfoSumsToOne(
      contract,
      answers,
      answersToBuy,
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      expiresAt
    )
  } else {
    throw new APIError(400, 'Not yet implemented')
  }
}

const getNewMultiCpmmBetsInfoSumsToOne = (
  contract: CPMMMultiContract,
  answers: Answer[],
  answersToBuy: Answer[],
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number
) => {
  const newBetResults = []
  const otherBetsResults: ReturnType<typeof combineBetsOnSameAnswers> = []
  if (answersToBuy.length === 1) {
    const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
      answers,
      answersToBuy[0],
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId
    )
    newBetResults.push(newBetResult)
    if (otherBetResults.length > 0)
      otherBetsResults.push(
        ...(otherBetResults as ReturnType<typeof combineBetsOnSameAnswers>)
      )
  } else {
    const multiRes = calculateCpmmMultiArbitrageBets(
      answers,
      answersToBuy,
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId
    )
    newBetResults.push(...multiRes.newBetResults)
    otherBetsResults.push(...multiRes.otherBetResults)
  }
  const now = Date.now()
  return newBetResults.map((newBetResult) => {
    const { takers, cpmmState, answer } = newBetResult
    const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)
    const amount = sumBy(takers, 'amount')
    const shares = sumBy(takers, 'shares')

    const newBet: CandidateBet = removeUndefinedProps({
      contractId: contract.id,
      outcome,
      orderAmount: betAmount,
      limitProb,
      isCancelled: false,
      amount,
      loanAmount: 0,
      shares,
      answerId: answer.id,
      fills: takers,
      isFilled: floatingEqual(amount, betAmount),
      probBefore: answer.prob,
      probAfter,
      createdTime: now,
      fees: noFees,
      isAnte: false,
      isRedemption: false,
      isChallenge: false,
      visibility: contract.visibility,
      expiresAt,
    })

    const otherResultsWithBet = otherBetsResults.map((result) => {
      const { answer, takers, cpmmState, outcome } = result
      const probBefore = answer.prob
      const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)

      const bet: CandidateBet = removeUndefinedProps({
        contractId: contract.id,
        outcome,
        orderAmount: 0,
        isCancelled: false,
        amount: 0,
        loanAmount: 0,
        shares: 0,
        answerId: answer.id,
        fills: takers,
        isFilled: true,
        probBefore,
        probAfter,
        createdTime: now,
        fees: noFees,
        isAnte: false,
        isRedemption: true,
        isChallenge: false,
        visibility: contract.visibility,
      })
      return {
        ...result,
        bet,
      }
    })

    return {
      newBet,
      newPool: cpmmState.pool,
      makers: newBetResult.makers,
      ordersToCancel: newBetResult.ordersToCancel,
      otherBetResults: otherResultsWithBet,
    }
  })
}

export const getBetDownToOneMultiBetInfo = (
  contract: CPMMMultiContract,
  answers: Answer[],
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const { noBetResults, extraMana } = buyNoSharesUntilAnswersSumToOne(
    answers,
    unfilledBets,
    balanceByUserId
  )

  const now = Date.now()

  const betResults = noBetResults.map((result) => {
    const { answer, takers, cpmmState } = result
    const probBefore = answer.prob
    const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)

    const bet: CandidateBet = removeUndefinedProps({
      contractId: contract.id,
      outcome: 'NO',
      orderAmount: 0,
      isCancelled: false,
      amount: 0,
      loanAmount: 0,
      shares: 0,
      answerId: answer.id,
      fills: takers,
      isFilled: true,
      probBefore,
      probAfter,
      createdTime: now,
      fees: noFees,
      isAnte: false,
      isRedemption: true,
      isChallenge: false,
      visibility: contract.visibility,
    })
    return {
      ...result,
      bet,
    }
  })

  return {
    betResults,
    extraMana,
  }
}
