import { partition, sumBy } from 'lodash'

import { Bet } from './bet'
import { CPMMContract, Contract } from './contract'
import { noFees } from './fees'
import { CandidateBet } from './new-bet'

type RedeemableBet = Pick<
  Bet,
  'outcome' | 'shares' | 'sharesByOutcome' | 'loanAmount'
>

const getBinaryRedeemableAmount = (bets: RedeemableBet[]) => {
  const [yesBets, noBets] = partition(bets, (b) => b.outcome === 'YES')
  const yesShares = sumBy(yesBets, (b) => b.shares)
  const noShares = sumBy(noBets, (b) => b.shares)

  const shares = Math.max(Math.min(yesShares, noShares), 0)
  const soldFrac = shares > 0 ? shares / Math.max(yesShares, noShares) : 0

  const loanAmount = sumBy(bets, (bet) => bet.loanAmount ?? 0)
  const loanPayment = loanAmount * soldFrac
  const netAmount = shares - loanPayment
  return { shares, loanPayment, netAmount }
}

export const getRedeemableAmount = (
  contract: CPMMContract,
  bets: RedeemableBet[]
) => {
  return getBinaryRedeemableAmount(bets)
}

export const getRedemptionBets = (
  contract: Contract,
  shares: number,
  loanPayment: number,
  prob: number
) => {
  const createdTime = Date.now()
  const yesBet: CandidateBet = {
    contractId: contract.id,
    amount: prob * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'YES',
    probBefore: prob,
    probAfter: prob,
    createdTime,
    fees: noFees,
    isAnte: false,
    isRedemption: true,
    isChallenge: false,
    visibility: contract.visibility,
  }
  const noBet: CandidateBet = {
    contractId: contract.id,
    amount: (1 - prob) * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'NO',
    probBefore: prob,
    probAfter: prob,
    createdTime,
    fees: noFees,
    isAnte: false,
    isRedemption: true,
    isChallenge: false,
    visibility: contract.visibility,
  }
  return [yesBet, noBet]
}
