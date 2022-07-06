import { sortBy, sumBy } from 'lodash'

import { Bet, fill, LimitBet, MAX_LOAN_PER_CONTRACT, NumericBet } from './bet'
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
  PseudoNumericContract,
} from './contract'
import { noFees } from './fees'
import { addObjects, removeUndefinedProps } from './util/object'
import { NUMERIC_FIXED_VAR } from './numeric-constants'
import {
  floatingEqual,
  floatingGreaterEqual,
  floatingLesserEqual,
} from './util/math'

export type CandidateBet<T extends Bet = Bet> = Omit<T, 'id' | 'userId'>
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
  matchedBet: LimitBet | undefined
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
    console.log('no fill', amount, outcome, prob, limitProb)
    // No fill.
    return undefined
  }

  const timestamp = Date.now()

  if (
    !matchedBet ||
    (outcome === 'YES'
      ? prob < matchedBet.limitProb
      : prob > matchedBet.limitProb)
  ) {
    // Fill from pool.
    const limit = !matchedBet
      ? limitProb
      : outcome === 'YES'
      ? Math.min(matchedBet.limitProb, limitProb ?? 1)
      : Math.max(matchedBet.limitProb, limitProb ?? 0)

    const poolAmount =
      limit === undefined
        ? amount
        : Math.min(amount, calculateCpmmAmount(cpmmState, limit, outcome))

    const { shares, newPool, newP, fees } = calculateCpmmPurchase(
      cpmmState,
      poolAmount,
      outcome
    )
    const newState = { pool: newPool, p: newP }

    console.log(
      'fill from pool',
      poolAmount,
      '/',
      amount,
      outcome,
      prob,
      limitProb
    )
    return {
      maker: {
        matchedBetId: null,
        shares,
        amount: poolAmount,
        state: newState,
        fees,
        timestamp,
      },
      taker: {
        matchedBetId: null,
        shares,
        amount: poolAmount,
        timestamp,
      },
    }
  }

  // Fill from matchedBet.
  const matchRemaining = matchedBet.orderAmount - matchedBet.amount
  const shares = Math.min(
    amount /
      (outcome === 'YES' ? matchedBet.limitProb : 1 - matchedBet.limitProb),
    matchRemaining /
      (outcome === 'YES' ? 1 - matchedBet.limitProb : matchedBet.limitProb)
  )

  console.log(
    'fill from matchedBet',
    amount,
    matchRemaining,
    shares,
    outcome,
    limitProb
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

export const getBinaryCpmmBetInfo = (
  outcome: 'YES' | 'NO',
  betAmount: number,
  contract: CPMMBinaryContract | PseudoNumericContract,
  limitProb: number | undefined,
  unfilledBets: LimitBet[]
) => {
  const sortedBets = sortBy(
    unfilledBets.filter((bet) => bet.outcome !== outcome),
    (bet) => (outcome === 'YES' ? bet.limitProb : -bet.limitProb),
    (bet) => bet.createdTime
  )

  console.log({ outcome, betAmount, limitProb, sortedBets })

  const takers: fill[] = []
  const makers: {
    bet: LimitBet
    amount: number
    shares: number
    timestamp: number
  }[] = []

  let amount = betAmount
  let cpmmState = { pool: contract.pool, p: contract.p }
  let totalFees = noFees

  let i = 0
  while (true) {
    const matchedBet: LimitBet | undefined = sortedBets[i]
    const fill = computeFill(amount, outcome, limitProb, cpmmState, matchedBet)
    if (!fill) break

    const { taker, maker } = fill

    amount -= taker.amount

    if (maker.matchedBetId === null) {
      // Matched against pool.
      cpmmState = maker.state
      totalFees = addObjects(totalFees, maker.fees)
      takers.push(taker)
    } else {
      // Matched against bet.
      takers.push(taker)
      makers.push(maker)
      i++
    }

    if (floatingEqual(amount, 0)) break
  }

  console.log({ makers, takers })

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
  })

  const { liquidityFee } = totalFees
  const newTotalLiquidity = (contract.totalLiquidity ?? 0) + liquidityFee

  return {
    newBet,
    newPool: cpmmState.pool,
    newP: cpmmState.p,
    newTotalLiquidity,
    makers,
  }
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

  const newBet: CandidateBet = {
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

  const newBet: CandidateBet = {
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
