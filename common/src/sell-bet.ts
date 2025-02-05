import { Bet, LimitBet } from './bet'
import {
  calculateCpmmMultiSumsToOneSale,
  calculateCpmmSale,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  Contract,
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from './contract'
import { sumBy } from 'lodash'
import { Answer } from './answer'
import { addObjects, removeUndefinedProps } from './util/object'
import {
  ArbitrageBetArray,
  calculateCpmmMultiArbitrageSellYesEqually,
} from 'common/calculate-cpmm-arbitrage'
import { getAnswerProbability, getProbability } from './calculate'
import { noFees } from './fees'

export type CandidateBet<T extends Bet> = Omit<
  T,
  'id' | 'userId' | 'userAvatarUrl' | 'userName' | 'userUsername'
>

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
          collectedFees: contract.collectedFees,
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
    isRedemption: false,
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
    balanceByUserId,
    contract.collectedFees
  )

  const { cpmmState, makers, takers, ordersToCancel, totalFees } = newBetResult!

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
    fees: totalFees,
    fills: takers,
    isFilled: true,
    isCancelled: false,
    orderAmount: takerAmount,
    isRedemption: false,
  }

  const updatedOtherBetResults = otherBetResults!.map((result) => {
    const { answer, takers, cpmmState, outcome, totalFees } = result
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
      fees: totalFees,
      isRedemption: true,
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
    otherBetResults: updatedOtherBetResults,
  }
}
export const getCpmmMultiSellSharesInfo = (
  contract: CPMMMultiContract | CPMMNumericContract,
  userBetsByAnswerIdToSell: { [answerId: string]: Bet[] },
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  loanPaidByAnswerId: { [answerId: string]: number }
) => {
  const { answers, collectedFees } = contract
  const { otherBetResults, newBetResults } =
    calculateCpmmMultiArbitrageSellYesEqually(
      answers,
      userBetsByAnswerIdToSell,
      unfilledBets,
      balanceByUserId,
      collectedFees
    )

  const now = Date.now()

  return newBetResults.map((b, i) => ({
    ...getNewSellBetInfo(b, now, answers, contract, loanPaidByAnswerId),
    otherBetResults:
      i === 0
        ? otherBetResults.map((ob) => ({
            ...ob,
            ...getNewSellBetInfo(ob, now, answers, contract, {}),
          }))
        : [],
  }))
}

export const getNewSellBetInfo = (
  newBetResult: ArbitrageBetArray[number],
  now: number,
  initialAnswers: Answer[],
  contract: Contract,
  loanPaidByAnswerId: { [answerId: string]: number }
) => {
  const {
    takers,
    cpmmState,
    answer: updatedAnswer,
    outcome,
    totalFees,
  } = newBetResult
  const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const amount = sumBy(takers, 'amount')
  const shares = sumBy(takers, 'shares')
  const oldAnswer = initialAnswers.find((a) => a.id === updatedAnswer.id)!
  const isRedemption = amount === 0
  const loanPaid = loanPaidByAnswerId[oldAnswer.id] ?? 0
  const newBet: CandidateBet<Bet> = removeUndefinedProps({
    contractId: contract.id,
    outcome,
    orderAmount: amount,
    isCancelled: false,
    amount,
    loanAmount: isRedemption ? 0 : -loanPaid,
    shares,
    answerId: oldAnswer.id,
    fills: takers,
    isFilled: true,
    probBefore: oldAnswer.prob,
    probAfter,
    createdTime: now,
    fees: totalFees,
    isRedemption,
    visibility: contract.visibility,
  })

  // The bet prop is for otherBetResults and newBet is for newBetResults
  return {
    newBet,
    bet: newBet,
    newPool: cpmmState.pool,
    makers: newBetResult.makers,
    ordersToCancel: newBetResult.ordersToCancel,
  }
}

export const getSaleResult = (
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  answer?: Answer
) => {
  if (contract.mechanism === 'cpmm-multi-1' && !answer)
    throw new Error('getSaleResult: answer must be defined for cpmm-multi-1')

  const initialProb = answer
    ? answer.prob
    : getProbability(contract as CPMMContract)
  const initialCpmmState = answer
    ? {
        pool: { YES: answer.poolYes, NO: answer.poolNo },
        p: 0.5,
        collectedFees: contract.collectedFees,
      }
    : {
        pool: (contract as CPMMContract).pool,
        p: (contract as CPMMContract).p,
        collectedFees: contract.collectedFees,
      }

  const {
    cpmmState,
    saleValue,
    buyAmount,
    fees,
    makers: wholeMakers,
    ordersToCancel,
  } = calculateCpmmSale(
    initialCpmmState,
    shares,
    outcome,
    unfilledBets,
    balanceByUserId
  )
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const probChange = Math.abs(resultProb - initialProb)
  const makers = wholeMakers.map((m) => m.bet).concat(ordersToCancel)
  return {
    saleValue,
    buyAmount,
    cpmmState,
    initialProb,
    resultProb,
    probChange,
    fees,
    makers,
  }
}

export const getSaleResultMultiSumsToOne = (
  contract: CPMMMultiContract | CPMMNumericContract,
  answerId: string,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const initialProb = getAnswerProbability(contract, answerId)
  const answerToSell = contract.answers.find((a) => a.id === answerId)
  const { newBetResult, saleValue, buyAmount, otherBetResults } =
    calculateCpmmMultiSumsToOneSale(
      contract.answers,
      answerToSell!,
      shares,
      outcome,
      undefined,
      unfilledBets,
      balanceByUserId,
      contract.collectedFees
    )
  const { cpmmState, totalFees } = newBetResult
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const probChange = Math.abs(resultProb - initialProb)

  const fees = addObjects(
    totalFees,
    otherBetResults.map((r) => r.totalFees).reduce(addObjects, noFees)
  )
  const makers = newBetResult.makers
    .map((m) => m.bet)
    .concat(otherBetResults.flatMap((r) => r.makers.map((m) => m.bet)))
    .concat(newBetResult.ordersToCancel)
    .concat(otherBetResults.flatMap((r) => r.ordersToCancel))
  return {
    saleValue,
    buyAmount,
    cpmmState,
    initialProb,
    resultProb,
    probChange,
    fees,
    makers,
  }
}
