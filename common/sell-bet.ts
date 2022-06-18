import { Bet } from './bet'
import {
  calculateDpmShareValue,
  deductDpmFees,
  getDpmOutcomeProbability,
} from './calculate-dpm'
import { calculateCpmmSale, getCpmmProbability } from './calculate-cpmm'
import { CPMMContract, DPMContract } from './contract'
import { DPM_CREATOR_FEE, DPM_PLATFORM_FEE, Fees } from './fees'

export type CandidateBet<T extends Bet> = Omit<T, 'id' | 'userId'>

export const getSellBetInfo = (bet: Bet, contract: DPMContract) => {
  const { pool, totalShares, totalBets } = contract
  const { id: betId, amount, shares, outcome } = bet

  const adjShareValue = calculateDpmShareValue(contract, bet)

  const newPool = { ...pool, [outcome]: pool[outcome] - adjShareValue }

  const newTotalShares = {
    ...totalShares,
    [outcome]: totalShares[outcome] - shares,
  }

  const newTotalBets = { ...totalBets, [outcome]: totalBets[outcome] - amount }

  const probBefore = getDpmOutcomeProbability(totalShares, outcome)
  const probAfter = getDpmOutcomeProbability(newTotalShares, outcome)

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

  const newBet: CandidateBet<Bet> = {
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

  return {
    newBet,
    newPool,
    newTotalShares,
    newTotalBets,
    fees,
  }
}

export const getCpmmSellBetInfo = (
  shares: number,
  outcome: 'YES' | 'NO',
  contract: CPMMContract,
  prevLoanAmount: number
) => {
  const { pool, p } = contract

  const { saleValue, newPool, newP, fees } = calculateCpmmSale(
    contract,
    shares,
    outcome
  )

  const loanPaid = Math.min(prevLoanAmount, saleValue)
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

  const newBet: CandidateBet<Bet> = {
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

  return {
    newBet,
    newPool,
    newP,
    fees,
  }
}
