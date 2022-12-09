import { Bet, LimitBet } from './bet'
import {
  calculateDpmShareValue,
  deductDpmFees,
  getDpmOutcomeProbability,
} from './calculate-dpm'
import { calculateCpmmSale, getCpmmProbability } from './calculate-cpmm'
import { CPMMContract, DPMContract } from './contract'
import { DPM_CREATOR_FEE, DPM_PLATFORM_FEE, Fees } from './fees'
import { sumBy } from 'lodash'

export type CandidateBet<T extends Bet> = Omit<
  T,
  'id' | 'userId' | 'userAvatarUrl' | 'userName' | 'userUsername'
>

export const getSellBetInfo = (bet: Bet, contract: DPMContract) => {
  const { pool, totalShares, totalBets } = contract
  const { id: betId, amount, shares, outcome, loanAmount } = bet

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
    'SELL Mana',
    amount,
    outcome,
    'for M',
    saleAmount,
    'creator fee: M',
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
    loanAmount: -(loanAmount ?? 0),
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
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
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  loanPaid: number
) => {
  const { pool, p } = contract

  const { saleValue, cpmmState, fees, makers, takers, ordersToCancel } =
    calculateCpmmSale(contract, shares, outcome, unfilledBets, balanceByUserId)

  const probBefore = getCpmmProbability(pool, p)
  const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)

  const takerAmount = sumBy(takers, 'amount')
  const takerShares = sumBy(takers, 'shares')

  console.log(
    'SELL ',
    shares,
    outcome,
    'for M',
    saleValue,
    'creator fee: M',
    fees.creatorFee
  )

  const newBet: CandidateBet<Bet> = {
    contractId: contract.id,
    amount: takerAmount,
    shares: takerShares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    loanAmount: -loanPaid,
    fees,
    fills: takers,
    isFilled: true,
    isCancelled: false,
    orderAmount: takerAmount,
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
  }

  return {
    newBet,
    newPool: cpmmState.pool,
    newP: cpmmState.p,
    fees,
    makers,
    takers,
    ordersToCancel,
  }
}
