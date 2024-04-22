import { sortBy, sumBy } from 'lodash'

import { Bet, fill, LimitBet } from './bet'
import { calculateDpmShares, getDpmOutcomeProbability } from './calculate-dpm'
import {
  calculateCpmmAmountToProbIncludingFees,
  calculateCpmmPurchase,
  CpmmState,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  CPMMBinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  DPMContract,
  MAX_CPMM_PROB,
  MAX_STONK_PROB,
  MIN_CPMM_PROB,
  MIN_STONK_PROB,
  PseudoNumericContract,
  StonkContract,
} from './contract'
import { CREATOR_FEE_FRAC, getTakerFee, noFees } from './fees'
import { addObjects, removeUndefinedProps } from './util/object'
import {
  floatingEqual,
  floatingGreaterEqual,
  floatingLesserEqual,
} from './util/math'
import { Answer } from './answer'
import {
  ArbitrageBetArray,
  buyNoSharesUntilAnswersSumToOne,
  calculateCpmmMultiArbitrageBet,
  calculateCpmmMultiArbitrageYesBets,
} from './calculate-cpmm-arbitrage'
import { APIError } from 'common/api/utils'

export type CandidateBet<T extends Bet = Bet> = Omit<
  T,
  'id' | 'userId' | 'userAvatarUrl' | 'userName' | 'userUsername'
>
export type NormalizedBet<T extends Bet = Bet> = Omit<
  T,
  'userAvatarUrl' | 'userName' | 'userUsername'
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
  matchedBetUserBalance: number | undefined,
  freeFees?: boolean
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
        : Math.min(
            amount,
            calculateCpmmAmountToProbIncludingFees(cpmmState, limit, outcome)
          )

    const { shares, newPool, newP, fees } = calculateCpmmPurchase(
      cpmmState,
      buyAmount,
      outcome,
      freeFees
    )
    const newState = { pool: newPool, p: newP }

    return {
      maker: {
        matchedBetId: null,
        shares,
        amount: buyAmount,
        state: newState,
        timestamp,
      },
      taker: {
        matchedBetId: null,
        shares,
        amount: buyAmount,
        timestamp,
        fees,
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

  const takerPrice =
    outcome === 'YES' ? matchedBet.limitProb : 1 - matchedBet.limitProb
  const makerPrice =
    outcome === 'YES' ? 1 - matchedBet.limitProb : matchedBet.limitProb

  const maxTakerShares = amount / (takerPrice + getTakerFee(1, takerPrice))
  const maxMakerShares = amountToFill / makerPrice
  const shares = Math.min(maxTakerShares, maxMakerShares)

  const takerFee = getTakerFee(shares, takerPrice)
  const creatorFee = CREATOR_FEE_FRAC * takerFee
  const platformFee = (1 - CREATOR_FEE_FRAC) * takerFee
  const fees = { creatorFee, platformFee, liquidityFee: 0 }

  const maker = {
    bet: matchedBet,
    matchedBetId: 'taker',
    amount: shares * makerPrice,
    shares,
    timestamp,
  }
  const taker = {
    matchedBetId: matchedBet.id,
    amount: shares * takerPrice + takerFee,
    shares,
    timestamp,
    fees,
  }
  return { maker, taker }
}

export const computeFills = (
  state: CpmmState,
  outcome: 'YES' | 'NO',
  betAmount: number,
  initialLimitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number | undefined },
  limitProbs?: { max: number; min: number },
  freeFees?: boolean
) => {
  if (isNaN(betAmount)) {
    throw new Error('Invalid bet amount: ${betAmount}')
  }
  if (isNaN(initialLimitProb ?? 0)) {
    throw new Error('Invalid limitProb: ${limitProb}')
  }
  const now = Date.now()
  const { max, min } = limitProbs ?? {}
  const limit = initialLimitProb ?? (outcome === 'YES' ? max : min)
  const limitProb = !limit
    ? undefined
    : limit > MAX_CPMM_PROB
    ? MAX_CPMM_PROB
    : limit < MIN_CPMM_PROB
    ? MIN_CPMM_PROB
    : limit

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
      currentBalanceByUserId[matchedBet?.userId ?? ''],
      freeFees
    )

    if (!fill) break

    const { taker, maker } = fill

    if (maker.matchedBetId === null) {
      // Matched against pool.
      cpmmState = maker.state
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

    totalFees = addObjects(totalFees, taker.fees)
    amount -= taker.amount

    if (floatingEqual(amount, 0)) break
  }

  return { takers, makers, totalFees, cpmmState, ordersToCancel }
}

export const computeCpmmBet = (
  cpmmState: CpmmState,
  outcome: 'YES' | 'NO',
  initialBetAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  limitProbs?: { max: number; min: number }
) => {
  const {
    takers,
    makers,
    cpmmState: afterCpmmState,
    ordersToCancel,
    totalFees,
  } = computeFills(
    cpmmState,
    outcome,
    initialBetAmount,
    limitProb,
    unfilledBets,
    balanceByUserId,
    limitProbs
  )
  const probBefore = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const probAfter = getCpmmProbability(afterCpmmState.pool, afterCpmmState.p)

  const takerAmount = sumBy(takers, 'amount')
  const takerShares = sumBy(takers, 'shares')
  const betAmount = limitProb ? initialBetAmount : takerAmount
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
    fees: totalFees,
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
    fees,
  } = computeCpmmBet(
    cpmmState,
    outcome,
    betAmount,
    limitProb,
    unfilledBets,
    balanceByUserId,
    contract.outcomeType === 'STONK'
      ? { max: MAX_STONK_PROB, min: MIN_STONK_PROB }
      : { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
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
    fees,
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
  contract: CPMMMultiContract | CPMMNumericContract,
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
    fees,
  } = computeCpmmBet(
    cpmmState,
    outcome,
    betAmount,
    limitProb,
    answerUnfilledBets,
    balanceByUserId,
    { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
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
    fees,
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
    visibility: contract.visibility,
    expiresAt,
  })

  return { newBet, newPool, makers, ordersToCancel }
}

export const getNewMultiCpmmBetsInfo = (
  contract: CPMMMultiContract | CPMMNumericContract,
  answers: Answer[],
  answersToBuy: Answer[],
  outcome: 'YES',
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
  contract: CPMMMultiContract | CPMMNumericContract,
  answers: Answer[],
  answersToBuy: Answer[],
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number
) => {
  const newBetResults: ArbitrageBetArray = []
  const isMultiBuy = answersToBuy.length > 1
  const otherBetsResults: ArbitrageBetArray = []
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
    newBetResults.push(...([newBetResult] as ArbitrageBetArray))
    if (otherBetResults.length > 0)
      otherBetsResults.push(...(otherBetResults as ArbitrageBetArray))
  } else {
    // TODO: only accepts YES bets atm
    const multiRes = calculateCpmmMultiArbitrageYesBets(
      answers,
      answersToBuy,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId
    )
    newBetResults.push(...multiRes.newBetResults)
    otherBetsResults.push(...multiRes.otherBetResults)
  }
  const now = Date.now()
  return newBetResults.map((newBetResult, i) => {
    const { takers, cpmmState, answer: updatedAnswer, totalFees } = newBetResult
    const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)
    const amount = sumBy(takers, 'amount')
    const shares = sumBy(takers, 'shares')
    const answer = answers.find((a) => a.id === updatedAnswer.id) as Answer
    const multiBuyAmount = sumBy(
      newBetResults.flatMap((r) => r.takers),
      'amount'
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
      fills: takers,
      isFilled: isMultiBuy
        ? floatingEqual(multiBuyAmount, betAmount)
        : floatingEqual(amount, betAmount),
      probBefore: answer.prob,
      probAfter,
      createdTime: now,
      fees: totalFees,
      isAnte: false,
      isRedemption: false,
      isChallenge: false,
      visibility: contract.visibility,
      expiresAt,
    })

    const otherResultsWithBet = otherBetsResults.map((result) => {
      const {
        answer: updatedAnswer,
        takers,
        cpmmState,
        outcome,
        totalFees,
      } = result
      const answer = answers.find((a) => a.id === updatedAnswer.id) as Answer
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
        fees: totalFees,
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
      otherBetResults: i === 0 ? otherResultsWithBet : [],
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
    const { answer, takers, cpmmState, totalFees } = result
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
      fees: totalFees,
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
