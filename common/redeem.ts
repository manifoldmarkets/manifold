import { partition, sumBy } from 'lodash'

import { Bet } from './bet'
import { getProbability } from './calculate'
import { CPMMContract } from './contract'
import { noFees } from './fees'
import { CandidateBet } from './new-bet'

type RedeemableBet = Pick<Bet, 'outcome' | 'shares' | 'loanAmount'>

export const getRedeemableAmount = (bets: RedeemableBet[]) => {
  const [yesBets, noBets] = partition(bets, (b) => b.outcome === 'YES')
  const yesShares = sumBy(yesBets, (b) => b.shares)
  const noShares = sumBy(noBets, (b) => b.shares)
  const shares = Math.max(Math.min(yesShares, noShares), 0)
  const soldFrac =
    shares > 0
      ? Math.min(yesShares, noShares) / Math.max(yesShares, noShares)
      : 0
  const loanAmount = sumBy(bets, (bet) => bet.loanAmount ?? 0)
  const loanPayment = loanAmount * soldFrac
  const netAmount = shares - loanPayment
  return { shares, loanPayment, netAmount }
}

export const getRedemptionBets = (
  shares: number,
  loanPayment: number,
  contract: CPMMContract
) => {
  const p = getProbability(contract)
  const createdTime = Date.now()
  const yesBet: CandidateBet = {
    contractId: contract.id,
    amount: p * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'YES',
    probBefore: p,
    probAfter: p,
    createdTime,
    isRedemption: true,
    fees: noFees,
  }
  const noBet: CandidateBet = {
    contractId: contract.id,
    amount: (1 - p) * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'NO',
    probBefore: p,
    probAfter: p,
    createdTime,
    isRedemption: true,
    fees: noFees,
  }
  return [yesBet, noBet]
}
