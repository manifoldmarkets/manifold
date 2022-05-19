import * as _ from 'lodash'

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
  Binary,
  CPMM,
  DPM,
  FreeResponse,
  FullContract,
  Multi,
  NumericContract,
} from './contract'
import { User } from './user'
import { noFees } from './fees'
import { addObjects } from './util/object'
import { NUMERIC_FIXED_VAR } from './numeric-constants'

export const getNewBinaryCpmmBetInfo = (
  user: User,
  outcome: 'YES' | 'NO',
  amount: number,
  contract: FullContract<CPMM, Binary>,
  loanAmount: number,
  newBetId: string
) => {
  const { shares, newPool, newP, fees } = calculateCpmmPurchase(
    contract,
    amount,
    outcome
  )

  const newBalance = user.balance - (amount - loanAmount)

  const { pool, p, totalLiquidity } = contract
  const probBefore = getCpmmProbability(pool, p)
  const probAfter = getCpmmProbability(newPool, newP)

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
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

  return { newBet, newPool, newP, newBalance, newTotalLiquidity, fees }
}

export const getNewBinaryDpmBetInfo = (
  user: User,
  outcome: 'YES' | 'NO',
  amount: number,
  contract: FullContract<DPM, Binary>,
  loanAmount: number,
  newBetId: string
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

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
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

  const newBalance = user.balance - (amount - loanAmount)

  return { newBet, newPool, newTotalShares, newTotalBets, newBalance }
}

export const getNewMultiBetInfo = (
  user: User,
  outcome: string,
  amount: number,
  contract: FullContract<DPM, Multi | FreeResponse>,
  loanAmount: number,
  newBetId: string
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

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
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

  const newBalance = user.balance - (amount - loanAmount)

  return { newBet, newPool, newTotalShares, newTotalBets, newBalance }
}

export const getNumericBetsInfo = (
  user: User,
  value: number,
  outcome: string,
  amount: number,
  contract: NumericContract,
  newBetId: string
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

  const newBet: NumericBet = {
    id: newBetId,
    userId: user.id,
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

  const newBalance = user.balance - amount

  return { newBet, newPool, newTotalShares, newTotalBets, newBalance }
}

export const getLoanAmount = (yourBets: Bet[], newBetAmount: number) => {
  const openBets = yourBets.filter((bet) => !bet.isSold && !bet.sale)
  const prevLoanAmount = _.sumBy(openBets, (bet) => bet.loanAmount ?? 0)
  const loanAmount = Math.min(
    newBetAmount,
    MAX_LOAN_PER_CONTRACT - prevLoanAmount
  )
  return loanAmount
}
