import { Bet, getNewBetId } from './bet'
import { Contract } from './contract'
import { noFees } from './fees'
import { removeUndefinedProps } from './util/object'
import { ContractMetric } from './contract-metric'

export const getBinaryRedeemableAmountFromContractMetric = (
  contractMetric: Omit<ContractMetric, 'id'>
) => {
  const yesShares = contractMetric.totalShares['YES'] ?? 0
  const noShares = contractMetric.totalShares['NO'] ?? 0
  const shares = Math.max(Math.min(yesShares, noShares), 0)
  const soldFrac = shares > 0 ? shares / Math.max(yesShares, noShares) : 0

  const loanAmount = contractMetric.loan ?? 0
  const loanPayment = loanAmount * soldFrac
  const netAmount = shares - loanPayment
  return { shares, loanPayment, netAmount }
}

export const getRedemptionBets = (
  contract: Contract,
  shares: number,
  loanPayment: number,
  prob: number,
  answerId: string | undefined,
  userId: string
) => {
  const createdTime = Date.now()
  const yesBet: Bet = removeUndefinedProps({
    id: getNewBetId(),
    userId,
    contractId: contract.id,
    amount: prob * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'YES',
    probBefore: prob,
    probAfter: prob,
    createdTime,
    fees: noFees,
    isRedemption: true,
    visibility: contract.visibility,
    answerId,
  })
  const noBet: Bet = removeUndefinedProps({
    id: getNewBetId(),
    userId,
    contractId: contract.id,
    amount: (1 - prob) * -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment / 2 : 0,
    outcome: 'NO',
    probBefore: prob,
    probAfter: prob,
    createdTime,
    fees: noFees,
    isRedemption: true,
    visibility: contract.visibility,
    answerId,
  })
  return [yesBet, noBet]
}
