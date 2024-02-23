import { Bet, LimitBet } from './bet'
import {
  calculateDpmShareValue,
  deductDpmFees,
  getDpmOutcomeProbability,
} from './calculate-dpm'
import {
  calculateCpmmMultiSumsToOneSale,
  calculateCpmmSale,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
  DPMContract,
} from './contract'
import { DPM_CREATOR_FEE, DPM_PLATFORM_FEE, Fees, noFees } from './fees'
import { sumBy } from 'lodash'
import { Answer } from './answer'
import { removeUndefinedProps } from './util/object'

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
    visibility: contract.visibility,
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
  contract: CPMMContract | CPMMMultiContract,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  loanPaid: number,
  answer?: Answer
) => {
  if (contract.mechanism === 'cpmm-multi-1' && !answer) {
    throw new Error('getCpmmSellBetInfo: answer required for cpmm-multi-1')
  }

  const startCpmmState =
    contract.mechanism === 'cpmm-1'
      ? contract
      : {
          pool: { YES: answer!.poolYes, NO: answer!.poolNo },
          p: 0.5,
        }

  const { cpmmState, fees, makers, takers, ordersToCancel } = calculateCpmmSale(
    startCpmmState,
    shares,
    outcome,
    unfilledBets,
    balanceByUserId
  )

  const probBefore = getCpmmProbability(startCpmmState.pool, startCpmmState.p)
  const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)

  const takerAmount = sumBy(takers, 'amount')
  const takerShares = sumBy(takers, 'shares')

  console.log(
    'SELL ',
    shares,
    outcome,
    'for M',
    -takerAmount,
    'creator fee: M',
    fees.creatorFee
  )

  const newBet: CandidateBet<Bet> = removeUndefinedProps({
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
    visibility: contract.visibility,
    answerId: answer?.id,
  })

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

export const getCpmmMultiSellBetInfo = (
  contract: CPMMMultiContract | CPMMNumericContract,
  answers: Answer[],
  answerToSell: Answer,
  shares: number,
  outcome: 'YES' | 'NO',
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  loanPaid: number
) => {
  const { newBetResult, otherBetResults } = calculateCpmmMultiSumsToOneSale(
    answers,
    answerToSell,
    shares,
    outcome,
    limitProb,
    unfilledBets,
    balanceByUserId
  )

  const { cpmmState, makers, takers, ordersToCancel } = newBetResult!

  const probBefore = answerToSell.prob
  const probAfter = getCpmmProbability(cpmmState.pool, 0.5)

  const takerAmount = sumBy(takers, 'amount')
  const takerShares = sumBy(takers, 'shares')

  const now = Date.now()

  const newBet: CandidateBet<Bet> = {
    contractId: contract.id,
    answerId: answerToSell.id,
    amount: takerAmount,
    shares: takerShares,
    outcome,
    probBefore,
    probAfter,
    createdTime: now,
    loanAmount: -loanPaid,
    fees: noFees,
    fills: takers,
    isFilled: true,
    isCancelled: false,
    orderAmount: takerAmount,
    isAnte: false,
    isRedemption: false,
    isChallenge: false,
    visibility: contract.visibility,
  }

  const otherResultsWithBet = otherBetResults!.map((result) => {
    const { answer, takers, cpmmState, outcome } = result
    const probBefore = answer.prob
    const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)

    const bet: CandidateBet<Bet> = removeUndefinedProps({
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
      fees: noFees,
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
    makers,
    ordersToCancel,
    otherResultsWithBet,
  }
}
