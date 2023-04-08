import { sortBy, sum, sumBy } from 'lodash'

import { Bet, fill, LimitBet, NumericBet } from './bet'
import {
  calculateDpmShares,
  calculateNumericDpmShares,
  getDpmOutcomeProbability,
  getDpmProbability,
  getNumericBets,
} from './calculate-dpm'
import {
  calculateCpmmAmountToProb,
  calculateCpmmPurchase,
  CpmmState,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  CPMMBinaryContract,
  CPMMMultipleChoiceContract,
  DPMBinaryContract,
  DPMContract,
  NumericContract,
  PseudoNumericContract,
  StonkContract,
} from './contract'
import { noFees } from './fees'
import { addObjects, removeUndefinedProps } from './util/object'
import { NUMERIC_FIXED_VAR } from './numeric-constants'
import {
  floatingEqual,
  floatingGreaterEqual,
  floatingLesserEqual,
} from './util/math'
import { buy, getProb, shortSell } from './calculate-cpmm-multi'

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
  const amountToFill = Math.min(
    amountRemaining,
    matchedBetUserBalance ?? amountRemaining
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
  outcome: 'YES' | 'NO',
  betAmount: number,
  state: CpmmState,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  if (isNaN(betAmount)) {
    throw new Error('Invalid bet amount: ${betAmount}')
  }
  if (isNaN(limitProb ?? 0)) {
    throw new Error('Invalid limitProb: ${limitProb}')
  }

  const sortedBets = sortBy(
    unfilledBets.filter((bet) => bet.outcome !== outcome),
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
      if (floatingGreaterEqual(maker.amount, 0)) {
        currentBalanceByUserId[userId] = makerBalance - maker.amount
      }
      if (floatingEqual(currentBalanceByUserId[userId], 0)) {
        // Now they've insufficient balance. Cancel maker bet.
        ordersToCancel.push(maker.bet)
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

export const getBinaryCpmmBetInfo = (
  outcome: 'YES' | 'NO',
  betAmount: number,
  contract: CPMMBinaryContract | PseudoNumericContract | StonkContract,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const { pool, p } = contract
  const { takers, makers, cpmmState, totalFees, ordersToCancel } = computeFills(
    outcome,
    betAmount,
    { pool, p },
    limitProb,
    unfilledBets,
    balanceByUserId
  )
  const probBefore = getCpmmProbability(contract.pool, contract.p)
  const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)

  const takerAmount = sumBy(takers, 'amount')
  const takerShares = sumBy(takers, 'shares')
  const isFilled = floatingEqual(betAmount, takerAmount)

  const newBet: CandidateBet = removeUndefinedProps({
    orderAmount: betAmount,
    amount: takerAmount,
    shares: takerShares,
    limitProb,
    isFilled,
    isCancelled: false,
    fills: takers,
    contractId: contract.id,
    outcome,
    probBefore,
    probAfter,
    loanAmount: 0,
    createdTime: Date.now(),
    fees: totalFees,
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
  })

  const { liquidityFee } = totalFees
  const newTotalLiquidity = (contract.totalLiquidity ?? 0) + liquidityFee

  return {
    newBet,
    newPool: cpmmState.pool,
    newP: cpmmState.p,
    newTotalLiquidity,
    makers,
    ordersToCancel,
  }
}

export const getBinaryBetStats = (
  outcome: 'YES' | 'NO',
  betAmount: number,
  contract: CPMMBinaryContract | PseudoNumericContract | StonkContract,
  limitProb: number,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const { newBet } = getBinaryCpmmBetInfo(
    outcome,
    betAmount ?? 0,
    contract,
    limitProb,
    unfilledBets,
    balanceByUserId
  )
  const remainingMatched =
    ((newBet.orderAmount ?? 0) - newBet.amount) /
    (outcome === 'YES' ? limitProb : 1 - limitProb)
  const currentPayout = newBet.shares + remainingMatched

  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0

  const totalFees = sum(Object.values(newBet.fees))

  return { currentPayout, currentReturn, totalFees, newBet }
}

export const getNewBinaryDpmBetInfo = (
  outcome: 'YES' | 'NO',
  amount: number,
  contract: DPMBinaryContract
) => {
  const { YES: yesPool, NO: noPool } = contract.pool

  const newPool =
    outcome === 'YES'
      ? { YES: yesPool + amount, NO: noPool }
      : { YES: yesPool, NO: noPool + amount }

  const shares = calculateDpmShares(contract.totalShares, amount, outcome)

  const { YES: yesShares, NO: noShares } = contract.totalShares

  const newTotalShares =
    outcome === 'YES'
      ? { YES: yesShares + shares, NO: noShares }
      : { YES: yesShares, NO: noShares + shares }

  const { YES: yesBets, NO: noBets } = contract.totalBets

  const newTotalBets =
    outcome === 'YES'
      ? { YES: yesBets + amount, NO: noBets }
      : { YES: yesBets, NO: noBets + amount }

  const probBefore = getDpmProbability(contract.totalShares)
  const probAfter = getDpmProbability(newTotalShares)

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
  }

  return { newBet, newPool, newTotalShares, newTotalBets }
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
  }

  return { newBet, newPool, newTotalShares, newTotalBets }
}

export const getNewMultiCpmmBetInfo = (
  contract: CPMMMultipleChoiceContract,
  outcome: string,
  amount: number,
  shouldShortSell: boolean
) => {
  const { pool } = contract

  let newPool: { [outcome: string]: number }
  let gainedShares: { [outcome: string]: number } | undefined = undefined
  let shares: number | undefined

  if (shouldShortSell)
    ({ newPool, gainedShares } = shortSell(pool, outcome, amount))
  else ({ newPool, shares } = buy(pool, outcome, amount))

  shares = gainedShares ? gainedShares[outcome] ?? 0 : shares

  const probBefore = getProb(pool, outcome)
  const probAfter = getProb(newPool, outcome)

  const newBet: CandidateBet = removeUndefinedProps({
    contractId: contract.id,
    amount,
    loanAmount: 0,
    shares: shares as number,
    sharesByOutcome: gainedShares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    fees: noFees,
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
  })

  return { newBet, newPool }
}

export const getNumericBetsInfo = (
  value: number,
  outcome: string,
  amount: number,
  contract: NumericContract
) => {
  const { pool, totalShares, totalBets } = contract

  const bets = getNumericBets(contract, outcome, amount, NUMERIC_FIXED_VAR)

  const allBetAmounts = Object.fromEntries(bets)
  const newTotalBets = addObjects(totalBets, allBetAmounts)
  const newPool = addObjects(pool, allBetAmounts)

  const { shares, totalShares: newTotalShares } = calculateNumericDpmShares(
    contract.totalShares,
    bets
  )

  const allOutcomeShares = Object.fromEntries(
    bets.map(([outcome], i) => [outcome, shares[i]])
  )

  const probBefore = getDpmOutcomeProbability(totalShares, outcome)
  const probAfter = getDpmOutcomeProbability(newTotalShares, outcome)

  const newBet: CandidateBet<NumericBet> = {
    contractId: contract.id,
    value,
    amount,
    allBetAmounts,
    shares: shares.find((s, i) => bets[i][0] === outcome) ?? 0,
    allOutcomeShares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    fees: noFees,
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
  }

  return { newBet, newPool, newTotalShares, newTotalBets }
}
