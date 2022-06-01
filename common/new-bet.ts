import { sumBy } from 'lodash'

import { Bet, MAX_LOAN_PER_CONTRACT, NumericBet } from './bet'
import {
  calculateDpmShares,
  getDpmProbability,
  getDpmOutcomeProbability,
  getNumericBets,
  calculateNumericDpmShares,
} from './calculate-dpm'
import { calculateCpmmPurchase, getCpmmProbability } from './calculate-cpmm'
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
