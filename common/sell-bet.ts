import { Bet } from './bet'
import {
  getDpmProbability,
  calculateDpmShareValue,
  deductDpmFees,
} from './calculate-dpm'
import {
  calculateCpmmSale,
  calculateCpmmShareValue,
  getCpmmProbability,
} from './calculate-cpmm'
import { Binary, DPM, CPMM, FullContract } from './contract'
import { CREATOR_FEE } from './fees'
import { User } from './user'

export const getSellBetInfo = (
  user: User,
  bet: Bet,
  contract: FullContract<DPM, any>,
  newBetId: string
) => {
  const { pool, totalShares, totalBets } = contract
  const { id: betId, amount, shares, outcome, loanAmount } = bet

  const adjShareValue = calculateDpmShareValue(contract, bet)

  const newPool = { ...pool, [outcome]: pool[outcome] - adjShareValue }

  const newTotalShares = {
    ...totalShares,
    [outcome]: totalShares[outcome] - shares,
  }

  const newTotalBets = { ...totalBets, [outcome]: totalBets[outcome] - amount }

  const probBefore = getDpmProbability(totalShares)
  const probAfter = getDpmProbability(newTotalShares)

  const profit = adjShareValue - amount
  const creatorFee = CREATOR_FEE * Math.max(0, profit)
  const saleAmount = deductDpmFees(amount, adjShareValue)

  console.log(
    'SELL M$',
    amount,
    outcome,
    'for M$',
    saleAmount,
    'creator fee: M$',
    creatorFee
  )

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount: -adjShareValue,
    shares: -shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    sale: {
      amount: saleAmount,
      betId,
    },
  }

  const newBalance = user.balance + saleAmount - (loanAmount ?? 0)

  return {
    newBet,
    newPool,
    newTotalShares,
    newTotalBets,
    newBalance,
    creatorFee,
  }
}

export const getCpmmSellBetInfo = (
  user: User,
  bet: Bet,
  contract: FullContract<CPMM, Binary>,
  newBetId: string
) => {
  const { pool } = contract
  const { id: betId, amount, shares, outcome } = bet

  const { saleValue, newPool } = calculateCpmmSale(contract, bet)

  const probBefore = getCpmmProbability(pool)
  const probAfter = getCpmmProbability(newPool)

  const profit = saleValue - amount
  const creatorFee = CREATOR_FEE * Math.max(0, profit)
  const saleAmount = deductDpmFees(amount, profit)

  console.log(
    'SELL M$',
    amount,
    outcome,
    'for M$',
    saleAmount,
    'creator fee: M$',
    creatorFee
  )

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount: -saleValue,
    shares: -shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    sale: {
      amount: saleAmount,
      betId,
    },
  }

  const newBalance = user.balance + saleAmount

  return {
    newBet,
    newPool,
    newBalance,
    creatorFee,
  }
}
