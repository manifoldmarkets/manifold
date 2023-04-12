import { mapValues, max, min, partition, sumBy } from 'lodash'

import { Bet } from './bet'
import { CPMM2Contract, CPMMContract, Contract } from './contract'
import { noFees } from './fees'
import { CandidateBet } from './new-bet'
import { addObjects } from './util/object'

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

const getRedeemableAmountMulti = (
  outcomes: string[],
  bets: RedeemableBet[]
) => {
  const zeros = Object.fromEntries(outcomes.map((o) => [o, 0]))

  const sharesByOutcome = bets
    .map(
      ({ sharesByOutcome, shares, outcome }) =>
        sharesByOutcome ?? { [outcome]: shares }
    )
    .reduce(addObjects, zeros)

  const shares = Math.max(0, min(Object.values(sharesByOutcome)) ?? 0)
  const soldFrac =
    shares > 0 ? shares / (max(Object.values(sharesByOutcome)) as number) : 0

  const loanAmount = sumBy(bets, (bet) => bet.loanAmount ?? 0)
  const loanPayment = loanAmount * soldFrac
  const netAmount = shares - loanPayment
  return { shares, loanPayment, netAmount }
}

export const getRedeemableAmount = (
  contract: CPMMContract | CPMM2Contract,
  bets: RedeemableBet[]
) => {
  if (contract.mechanism === 'cpmm-2') {
    return getRedeemableAmountMulti(
      contract.answers.map((a) => a.id),
      bets
    )
  }
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

export const getRedemptionBetMulti = (
  contract: Contract,
  shares: number,
  loanPayment: number,
  probsByOutcome: Record<string, number>
) => {
  const sharesByOutcome = mapValues(probsByOutcome, () => -shares)
  const firstOutcome = Object.keys(sharesByOutcome)[0]
  const createdTime = Date.now()

  const redemptionBet: CandidateBet = {
    contractId: contract.id,
    amount: -shares,
    shares: -shares,
    loanAmount: loanPayment ? -loanPayment : 0,
    outcome: firstOutcome,
    sharesByOutcome,
    probBefore: probsByOutcome[firstOutcome],
    probAfter: probsByOutcome[firstOutcome],
    createdTime,
    isAnte: false,
    isRedemption: true,
    isChallenge: false,
    fees: noFees,
    visibility: contract.visibility,
  }
  return redemptionBet
}
