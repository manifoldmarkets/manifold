import { LimitBet } from './bet'
import { computeDpmBet } from './calculate-dpm-fills'
import { DPMContract } from './contract'
import { CandidateBet } from './new-bet'
import { removeUndefinedProps } from './util/object'

/**
 * DPM variant of `getBinaryCpmmBetInfo`. Produces the same `{ newBet, newPool, makers, ordersToCancel }`
 * shape so `executeNewBetResult` can consume it with only a per-mechanism
 * contract-update branch.
 */
export const getBinaryDpmBetInfo = (
  contract: DPMContract,
  outcome: 'YES' | 'NO',
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  expiresAt?: number,
  expiresMillisAfter?: number
) => {
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
    newPool,
  } = computeDpmBet(
    { pool: contract.pool },
    outcome,
    betAmount,
    limitProb,
    unfilledBets,
    balanceByUserId
  )
  const now = Date.now()
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
    fees: {
      creatorFee: 0,
      liquidityFee: 0,
      platformFee: 0,
    },
    isRedemption: false,
    visibility: contract.visibility,
    expiresAt:
      expiresAt ?? (expiresMillisAfter ? now + expiresMillisAfter : undefined),
  })

  return {
    newBet,
    newPool,
    makers,
    ordersToCancel,
  }
}
