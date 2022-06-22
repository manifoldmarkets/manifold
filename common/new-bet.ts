import { sumBy } from 'lodash'

import { Bet, LimitBet, MAX_LOAN_PER_CONTRACT, NumericBet } from './bet'
import {
  calculateDpmShares,
  getDpmProbability,
  getDpmOutcomeProbability,
  getNumericBets,
  calculateNumericDpmShares,
} from './calculate-dpm'
import {
  calculateCpmmAmount,
  calculateCpmmPurchase,
  CpmmState,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  CPMMBinaryContract,
  DPMBinaryContract,
  FreeResponseContract,
  NumericContract,
} from './contract'
import { noFees } from './fees'
import { addObjects } from './util/object'
import { NUMERIC_FIXED_VAR } from './numeric-constants'

export type CandidateBet<T extends Bet> = Omit<T, 'id' | 'userId'>
export type BetInfo = {
  newBet: CandidateBet<Bet>
  newPool?: { [outcome: string]: number }
  newTotalShares?: { [outcome: string]: number }
  newTotalBets?: { [outcome: string]: number }
  newTotalLiquidity?: number
  newP?: number
}

const computeFill = (
  betAmount: number,
  outcome: 'YES' | 'NO',
  limitProb: number,
  cpmmState: CpmmState,
  matchedBet: LimitBet
) => {
  const prob = getCpmmProbability(cpmmState.pool, cpmmState.p)

  if (
    outcome === 'YES'
      ? Math.min(prob, matchedBet.limitProb) > limitProb
      : Math.max(prob, matchedBet.limitProb) < limitProb
  ) {
    return undefined
  }

  if (
    outcome === 'YES'
      ? prob < matchedBet.limitProb
      : prob > matchedBet.limitProb
  ) {
    // Fill from pool.
    const limit =
      outcome === 'YES'
        ? Math.min(matchedBet.limitProb, limitProb)
        : Math.max(matchedBet.limitProb, limitProb)
    const amount = calculateCpmmAmount(cpmmState, limit, 'YES')

    const { shares, newPool, newP, fees } = calculateCpmmPurchase(
      cpmmState,
      amount,
      'YES'
    )
    const newState = { pool: newPool, p: newP }

    return {
      maker: {
        betId: 'bet',
        matchedBetId: null,
        shares,
        amount,
        state: newState,
        fees,
      },
      taker: {
        betId: 'bet',
        matchedBetId: null,
        shares,
        amount,
      },
    }
  }

  // Fill from bet.
  const amount = Math.min(betAmount, matchedBet.amount)
  const shares = matchedBet.shares * (amount / matchedBet.amount)
  const maker = {
    betId: matchedBet.id,
    matchedBetId: 'bet',
    amount,
    shares,
  }
  const taker = {
    betId: 'bet',
    matchedBetId: matchedBet.id,
    amount,
    shares,
  }
  return { maker, taker }
}

export const getBinaryCpmmLimitBetInfo = (
  outcome: 'YES' | 'NO',
  betAmount: number,
  contract: CPMMBinaryContract,
  limitProb: number,
  unfilledBets: LimitBet[] // Sorted by limitProb, createdTime
) => {
  const fills: LimitBet['fills'] = []

  let cpmmState = { pool: contract.pool, p: contract.p }
  let totalFees = noFees

  for (const bet of unfilledBets) {
    const fill = computeFill(betAmount, outcome, limitProb, cpmmState, bet)
    if (!fill) break

    const { maker, taker } = fill

    betAmount -= taker.amount

    if (maker.matchedBetId === null) {
      cpmmState = maker.state
      totalFees = addObjects(totalFees, maker.fees)
    } else {
      fills.push(maker)
    }
    fills.push(taker)
  }

  return { fills, cpmmState, totalFees }
}

export const getNewBinaryCpmmBetInfo = (
  outcome: 'YES' | 'NO',
  amount: number,
  contract: CPMMBinaryContract,
  loanAmount: number
) => {
  const { shares, newPool, newP, fees } = calculateCpmmPurchase(
    contract,
    amount,
    outcome
  )

  const { pool, p, totalLiquidity } = contract
  const probBefore = getCpmmProbability(pool, p)
  const probAfter = getCpmmProbability(newPool, newP)

  const newBet: CandidateBet<Bet> = {
    contractId: contract.id,
    amount,
    shares,
    outcome,
    fees,
    loanAmount,
    probBefore,
    probAfter,
    createdTime: Date.now(),
  }

  const { liquidityFee } = fees
  const newTotalLiquidity = (totalLiquidity ?? 0) + liquidityFee

  return { newBet, newPool, newP, newTotalLiquidity }
}

export const getNewBinaryDpmBetInfo = (
  outcome: 'YES' | 'NO',
  amount: number,
  contract: DPMBinaryContract,
  loanAmount: number
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

  const newBet: CandidateBet<Bet> = {
    contractId: contract.id,
    amount,
    loanAmount,
    shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    fees: noFees,
  }

  return { newBet, newPool, newTotalShares, newTotalBets }
}

export const getNewMultiBetInfo = (
  outcome: string,
  amount: number,
  contract: FreeResponseContract,
  loanAmount: number
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

  const newBet: CandidateBet<Bet> = {
    contractId: contract.id,
    amount,
    loanAmount,
    shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    fees: noFees,
  }

  return { newBet, newPool, newTotalShares, newTotalBets }
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
  }

  return { newBet, newPool, newTotalShares, newTotalBets }
}

export const getLoanAmount = (yourBets: Bet[], newBetAmount: number) => {
  const openBets = yourBets.filter((bet) => !bet.isSold && !bet.sale)
  const prevLoanAmount = sumBy(openBets, (bet) => bet.loanAmount ?? 0)
  const loanAmount = Math.min(
    newBetAmount,
    MAX_LOAN_PER_CONTRACT - prevLoanAmount
  )
  return loanAmount
}
