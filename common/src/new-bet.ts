import { sumBy } from 'lodash'

import { Bet, LimitBet } from './bet'
import { computeFills, CpmmState, getCpmmProbability } from './calculate-cpmm'
import {
  BinaryContract,
  CPMMMultiContract,
  CPMMNumericContract,
  MAX_CPMM_PROB,
  MAX_STONK_PROB,
  MIN_CPMM_PROB,
  MIN_STONK_PROB,
  PseudoNumericContract,
  StonkContract,
} from './contract'
import { removeUndefinedProps } from './util/object'
import { floatingEqual } from './util/math'
import { Answer } from './answer'
import {
  ArbitrageBetArray,
  buyNoSharesUntilAnswersSumToOne,
  calculateCpmmMultiArbitrageBet,
  calculateCpmmMultiArbitrageYesBets,
} from './calculate-cpmm-arbitrage'
import { APIError } from 'common/api/utils'

export type CandidateBet<T extends Bet = Bet> = Omit<T, 'id' | 'userId'>

export type BetInfo = {
  newBet: CandidateBet
  newPool?: { [outcome: string]: number }
  newTotalLiquidity?: number
  newP?: number
}

export const computeCpmmBet = (
  cpmmState: CpmmState,
  outcome: 'YES' | 'NO',
  initialBetAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  limitProbs?: { max: number; min: number }
) => {
  const {
    takers,
    makers,
    cpmmState: afterCpmmState,
    ordersToCancel,
    totalFees,
  } = computeFills(
    cpmmState,
    outcome,
    initialBetAmount,
    limitProb,
    unfilledBets,
    balanceByUserId,
    limitProbs
  )
  const probBefore = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const probAfter = getCpmmProbability(afterCpmmState.pool, afterCpmmState.p)

  const takerAmount = sumBy(takers, 'amount')
  const takerShares = sumBy(takers, 'shares')
  const betAmount = limitProb ? initialBetAmount : takerAmount
  const isFilled = floatingEqual(betAmount, takerAmount)

  return {
    orderAmount: betAmount,
    amount: takerAmount,
    shares: takerShares,
    isFilled,
    fills: takers,
    probBefore,
    probAfter,
    makers,
    ordersToCancel,
    fees: totalFees,
    pool: afterCpmmState.pool,
    p: afterCpmmState.p,
  }
}

export const getBinaryCpmmBetInfo = (
  contract: BinaryContract | PseudoNumericContract | StonkContract,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number,
  expiresMillisAfter?: number
) => {
  const cpmmState = {
    pool: contract.pool,
    p: contract.p,
    collectedFees: contract.collectedFees,
  }
  const {
    orderAmount,
    amount,
    shares,
    isFilled,
    fills,
    probBefore,
    probAfter,
    makers,
    ordersToCancel,
    pool,
    p,
    fees,
  } = computeCpmmBet(
    cpmmState,
    outcome,
    betAmount,
    limitProb,
    unfilledBets,
    balanceByUserId,
    contract.outcomeType === 'STONK'
      ? { max: MAX_STONK_PROB, min: MIN_STONK_PROB }
      : { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
  )
  const now = Date.now()
  const silent = expiresMillisAfter !== undefined ? true : undefined
  const newBet: CandidateBet = removeUndefinedProps({
    orderAmount,
    amount,
    shares,
    limitProb,
    isFilled,
    isCancelled: false,
    fills,
    contractId: contract.id,
    outcome,
    probBefore,
    probAfter,
    loanAmount: 0,
    createdTime: now,
    fees,
    isRedemption: false,
    visibility: contract.visibility,
    expiresAt:
      expiresAt ?? (expiresMillisAfter ? now + expiresMillisAfter : undefined),
    silent,
  })

  return {
    newBet,
    newPool: pool,
    newP: p,
    makers,
    ordersToCancel,
  }
}

export const getNewMultiCpmmBetInfo = (
  contract: CPMMMultiContract | CPMMNumericContract,
  answers: Answer[],
  answer: Answer,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number,
  expiresMillisAfter?: number
) => {
  if (contract.shouldAnswersSumToOne) {
    return getNewMultiCpmmBetsInfoSumsToOne(
      contract,
      answers,
      [answer],
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      expiresAt,
      expiresMillisAfter
    )[0]
  }

  const { poolYes, poolNo } = answer
  const pool = { YES: poolYes, NO: poolNo }
  const cpmmState = { pool, p: 0.5, collectedFees: contract.collectedFees }

  const answerUnfilledBets = unfilledBets.filter(
    (b) => b.answerId === answer.id
  )

  const {
    amount,
    fills,
    isFilled,
    makers,
    ordersToCancel,
    probAfter,
    probBefore,
    shares,
    pool: newPool,
    fees,
  } = computeCpmmBet(
    cpmmState,
    outcome,
    betAmount,
    limitProb,
    answerUnfilledBets,
    balanceByUserId,
    { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
  )
  const now = Date.now()
  const silent = expiresMillisAfter !== undefined ? true : undefined
  const newBet: CandidateBet = removeUndefinedProps({
    contractId: contract.id,
    outcome,
    orderAmount: betAmount,
    limitProb,
    isCancelled: false,
    amount,
    loanAmount: 0,
    shares,
    answerId: answer.id,
    fills,
    isFilled,
    probBefore,
    probAfter,
    createdTime: now,
    fees,
    isRedemption: false,
    visibility: contract.visibility,
    expiresAt:
      expiresAt ?? (expiresMillisAfter ? now + expiresMillisAfter : undefined),
    silent,
  })

  return { newBet, newPool, makers, ordersToCancel }
}

export const getNewMultiCpmmBetsInfo = (
  contract: CPMMMultiContract | CPMMNumericContract,
  answers: Answer[],
  answersToBuy: Answer[],
  outcome: 'YES',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number
) => {
  if (contract.shouldAnswersSumToOne) {
    return getNewMultiCpmmBetsInfoSumsToOne(
      contract,
      answers,
      answersToBuy,
      outcome,
      betAmount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      expiresAt
    )
  } else {
    throw new APIError(400, 'Not yet implemented')
  }
}

const getNewMultiCpmmBetsInfoSumsToOne = (
  contract: CPMMMultiContract | CPMMNumericContract,
  answers: Answer[],
  answersToBuy: Answer[],
  outcome: 'YES' | 'NO',
  initialBetAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number,
  expiresMillisAfter?: number
) => {
  const newBetResults: ArbitrageBetArray = []
  const isMultiBuy = answersToBuy.length > 1
  const otherBetsResults: ArbitrageBetArray = []
  if (answersToBuy.length === 1) {
    const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
      answers,
      answersToBuy[0],
      outcome,
      initialBetAmount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      contract.collectedFees
    )
    if (newBetResult.takers.length === 0 && !limitProb) {
      throw new APIError(400, 'Betting allowed only between 1-99%.')
    }
    newBetResults.push(...([newBetResult] as ArbitrageBetArray))
    if (otherBetResults.length > 0)
      otherBetsResults.push(...(otherBetResults as ArbitrageBetArray))
  } else {
    // NOTE: only accepts YES bets atm
    const multiRes = calculateCpmmMultiArbitrageYesBets(
      answers,
      answersToBuy,
      initialBetAmount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      contract.collectedFees
    )
    newBetResults.push(...multiRes.newBetResults)
    otherBetsResults.push(...multiRes.otherBetResults)
  }
  const now = Date.now()
  return newBetResults.map((newBetResult, i) => {
    const { takers, cpmmState, answer: updatedAnswer, totalFees } = newBetResult
    const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)
    const takerAmount = sumBy(takers, 'amount')
    const takerShares = sumBy(takers, 'shares')
    const answer = answers.find((a) => a.id === updatedAnswer.id)!
    const multiBuyTakerAmount = sumBy(
      newBetResults.flatMap((r) => r.takers),
      'amount'
    )
    const betAmount = limitProb
      ? initialBetAmount
      : isMultiBuy
      ? multiBuyTakerAmount
      : takerAmount

    const silent = expiresMillisAfter !== undefined ? true : undefined
    const newBet: CandidateBet = removeUndefinedProps({
      orderAmount: betAmount,
      amount: takerAmount,
      shares: takerShares,
      isFilled: isMultiBuy
        ? floatingEqual(multiBuyTakerAmount, betAmount)
        : floatingEqual(takerAmount, betAmount),
      fills: takers,
      contractId: contract.id,
      outcome,
      limitProb,
      isCancelled: false,
      loanAmount: 0,
      answerId: answer.id,
      probBefore: answer.prob,
      probAfter,
      createdTime: now,
      fees: totalFees,
      isRedemption: false,
      visibility: contract.visibility,
      expiresAt:
        expiresAt ??
        (expiresMillisAfter ? now + expiresMillisAfter : undefined),
      silent,
    })

    const otherResultsWithBet = otherBetsResults.map((result) => {
      const {
        answer: updatedAnswer,
        takers,
        cpmmState,
        outcome,
        totalFees,
      } = result
      const answer = answers.find((a) => a.id === updatedAnswer.id)!
      const probBefore = answer.prob
      const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)

      const bet: CandidateBet = removeUndefinedProps({
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
      makers: newBetResult.makers,
      ordersToCancel: newBetResult.ordersToCancel,
      otherBetResults: i === 0 ? otherResultsWithBet : [],
    }
  })
}

export const getBetDownToOneMultiBetInfo = (
  contract: CPMMMultiContract,
  answers: Answer[],
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const { noBetResults, extraMana } = buyNoSharesUntilAnswersSumToOne(
    answers,
    unfilledBets,
    balanceByUserId,
    contract.collectedFees
  )

  const now = Date.now()

  const betResults = noBetResults.map((result) => {
    const { answer, takers, cpmmState, totalFees } = result
    const probBefore = answer.prob
    const probAfter = getCpmmProbability(cpmmState.pool, cpmmState.p)

    const bet: CandidateBet = removeUndefinedProps({
      contractId: contract.id,
      outcome: 'NO',
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
      visibility: contract.visibility,
    })
    return {
      ...result,
      bet,
    }
  })

  return {
    betResults,
    extraMana,
  }
}
