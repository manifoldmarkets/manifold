import {
  CPMM_ARBITRAGE_ERROR_PREFIX,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import { getLimitOrderFill, LimitBet, LimitOrderFill } from 'common/bet'
import { Answer } from 'common/answer'
import { noFees } from 'common/fees'
import { calculateCpmmMultiArbitrageBet } from 'common/calculate-cpmm-arbitrage'
import { sumBy } from 'lodash'
import { addObjects } from 'common/util/object'
import { computeCpmmBet } from 'common/new-bet'
import { MAX_CPMM_PROB, MIN_CPMM_PROB } from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { MarketContract } from 'common/contract'
const DEFAULT_SLIPPAGE = 0.1

export const getLimitBetReturns = (
  binaryOutcome: 'YES' | 'NO',
  betAmount: number,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  contract: MarketContract,
  multiProps: MultiBetProps | undefined,
  manualLimitProb: number | undefined,
  slippageProtection: boolean
) => {
  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : false
  const arbitrageProps = shouldAnswersSumToOne ? multiProps : undefined
  // The outcome is always relative to `answerToBuy`. On a versus market the
  // panel bets on the main answer: YES backs it, NO backs the other answer.
  const outcome = binaryOutcome

  const isCpmmMulti = contract.mechanism === 'cpmm-multi-1'
  const cpmmState = isCpmmMulti
    ? {
        pool: {
          YES: multiProps!.answerToBuy.poolYes,
          NO: multiProps!.answerToBuy.poolNo,
        },
        p: 0.5,
        collectedFees: contract.collectedFees,
      }
    : {
        pool: contract.pool,
        p: contract.p,
        collectedFees: contract.collectedFees,
      }
  const prob = getCpmmProbability(cpmmState.pool, cpmmState.p)
  const slippage = slippageProtection ? DEFAULT_SLIPPAGE : 1
  const floatLimitProb = Math.max(
    MIN_CPMM_PROB,
    Math.min(
      MAX_CPMM_PROB,
      outcome === 'YES' ? prob + slippage : prob - slippage
    )
  )

  const limitProb = Math.round((manualLimitProb ?? floatLimitProb) * 100) / 100

  const orderAmount = betAmount
  let amount = 0
  let shares = 0
  let fees = noFees
  let betDeps: LimitBet[] = []
  let limitOrderFill: LimitOrderFill = { shares: 0, orderCount: 0 }
  let probAfter = 0
  let calculationError: string | undefined = undefined
  try {
    if (arbitrageProps) {
      const { answers, answerToBuy } = arbitrageProps
      const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
        answers,
        answerToBuy,
        outcome,
        betAmount,
        limitProb,
        unfilledBets,
        balanceByUserId,
        cpmmState.collectedFees
      )
      amount = sumBy(newBetResult.takers, 'amount')
      shares = sumBy(newBetResult.takers, 'shares')
      betDeps = newBetResult.makers
        .map((m) => m.bet)
        .concat(otherBetResults.flatMap((r) => r.makers.map((m) => m.bet)))
        .concat(newBetResult.ordersToCancel)
        .concat(otherBetResults.flatMap((r) => r.ordersToCancel))
      // Only the answer being bought — see getSaleResultMultiSumsToOne.
      limitOrderFill = getLimitOrderFill(newBetResult.makers)
      fees = addObjects(
        newBetResult.totalFees,
        otherBetResults.reduce(
          (feeSum, results) => addObjects(feeSum, results.totalFees),
          noFees
        )
      )
      probAfter = getCpmmProbability(
        newBetResult.cpmmState.pool,
        newBetResult.cpmmState.p
      )
    } else {
      const result = computeCpmmBet(
        cpmmState,
        outcome,
        betAmount,
        limitProb,
        unfilledBets,
        balanceByUserId,
        !arbitrageProps && { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
      )
      amount = result.amount
      shares = result.shares
      fees = result.fees
      betDeps = result.makers.map((m) => m.bet).concat(result.ordersToCancel)
      limitOrderFill = getLimitOrderFill(result.makers)
      probAfter = result.probAfter
    }
  } catch (err: any) {
    console.error('Error in getLimitBetReturns:', err)
    calculationError =
      (err?.message.startsWith(CPMM_ARBITRAGE_ERROR_PREFIX)
        ? `Error buying ${outcome} on this answer, buy ${
            outcome === 'YES' ? 'NO' : 'YES'
          } in other answers first.`
        : err?.message) ??
      `An error occurred during ${TRADE_TERM} calculation, try again.`
  }
  const remainingMatched = limitProb
    ? ((orderAmount ?? 0) - amount) /
      (outcome === 'YES' ? limitProb : 1 - limitProb)
    : 0
  const currentPayout = shares + remainingMatched
  const currentReturn = betAmount ? (currentPayout - betAmount) / betAmount : 0

  return {
    orderAmount,
    amount,
    shares,
    currentPayout,
    currentReturn,
    fees,
    betDeps,
    limitOrderFill,
    probAfter,
    limitProb,
    prob,
    calculationError,
  }
}
export type MultiBetProps = {
  answers: Answer[]
  answerToBuy: Answer
  /**
   * Display-only label of the answer being backed. It does not decide which
   * side is bought: that is the bet outcome relative to `answerToBuy` (see
   * `versusSide` in common/versus).
   */
  answerText?: string
}
