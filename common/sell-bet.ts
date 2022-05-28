import { Bet } from './bet'
import {
  getDpmProbability,
  calculateDpmShareValue,
  deductDpmFees,
} from './calculate-dpm'
import { calculateCpmmSale, getCpmmProbability } from './calculate-cpmm'
import { Binary, Contract, DPM, CPMM } from './contract'
import { DPM_CREATOR_FEE, DPM_PLATFORM_FEE, Fees } from './fees'
import { User } from './user'

export const getSellBetInfo = (
  user: User,
  bet: Bet,
  contract: Contract & DPM,
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

  const creatorFee = DPM_CREATOR_FEE * Math.max(0, profit)
  const platformFee = DPM_PLATFORM_FEE * Math.max(0, profit)
  const fees: Fees = {
    creatorFee,
    platformFee,
    liquidityFee: 0,
  }

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
    fees,
  }

  const newBalance = user.balance + saleAmount - (loanAmount ?? 0)

  return {
    newBet,
    newPool,
    newTotalShares,
    newTotalBets,
    newBalance,
    fees,
  }
}

export const getCpmmSellBetInfo = (
  user: User,
  shares: number,
  outcome: 'YES' | 'NO',
  contract: Contract<CPMM & Binary>,
  prevLoanAmount: number,
  newBetId: string
) => {
  const { pool, p } = contract

  const { saleValue, newPool, newP, fees } = calculateCpmmSale(
    contract,
    shares,
    outcome
  )

  const loanPaid = Math.min(prevLoanAmount, saleValue)
  const netAmount = saleValue - loanPaid

  const probBefore = getCpmmProbability(pool, p)
  const probAfter = getCpmmProbability(newPool, p)

  console.log(
    'SELL M$',
    shares,
    outcome,
    'for M$',
    saleValue,
    'creator fee: M$',
    fees.creatorFee
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
    loanAmount: -loanPaid,
    fees,
  }

  const newBalance = user.balance + netAmount

  return {
    newBet,
    newPool,
    newP,
    newBalance,
    fees,
  }
}
