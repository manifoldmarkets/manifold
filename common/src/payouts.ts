import { sumBy, groupBy, mapValues } from 'lodash'

import { Bet } from './bet'
import { Contract, CPMM2Contract, CPMMContract, DPMContract } from './contract'
import { Fees } from './fees'
import { LiquidityProvision } from './liquidity-provision'
import {
  getDpmCancelPayouts,
  getDpmMktPayouts,
  getDpmStandardPayouts,
  getPayoutsMultiOutcome,
} from './payouts-dpm'
import {
  getFixedCancelPayouts,
  getMktFixedPayouts,
  getStandardFixedPayouts,
} from './payouts-fixed'

export type Payout = {
  userId: string
  payout: number
}

export const getLoanPayouts = (bets: Bet[]): Payout[] => {
  const betsWithLoans = bets.filter((bet) => bet.loanAmount)
  const betsByUser = groupBy(betsWithLoans, (bet) => bet.userId)
  const loansByUser = mapValues(betsByUser, (bets) =>
    sumBy(bets, (bet) => -(bet.loanAmount ?? 0))
  )
  return Object.entries(loansByUser).map(([userId, payout]) => ({
    userId,
    payout,
  }))
}

export const groupPayoutsByUser = (payouts: Payout[]) => {
  const groups = groupBy(payouts, (payout) => payout.userId)
  return mapValues(groups, (group) => sumBy(group, (g) => g.payout))
}

export type PayoutInfo = {
  payouts: Payout[]
  creatorPayout: number
  liquidityPayouts: Payout[]
  collectedFees: Fees
}

export const getPayouts = (
  outcome: string | undefined,
  contract: Contract,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutions?: {
    [outcome: string]: number
  },
  resolutionProbability?: number
): PayoutInfo => {
  if (contract.mechanism === 'cpmm-1' || contract.mechanism === 'cpmm-2') {
    return getFixedPayouts(
      outcome,
      contract,
      bets,
      liquidities,
      resolutions,
      resolutionProbability
    )
  }
  if (contract.mechanism === 'dpm-2') {
    return getDpmPayouts(
      outcome,
      contract,
      bets,
      resolutions,
      resolutionProbability
    )
  }
  throw new Error('getPayouts not implemented')
}

export const getFixedPayouts = (
  outcome: string | undefined,
  contract: CPMMContract | CPMM2Contract,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutions?: {
    [outcome: string]: number
  },
  resolutionProbability?: number
) => {
  switch (outcome) {
    case 'YES':
    case 'NO':
      return getStandardFixedPayouts(outcome, contract, bets, liquidities)
    case 'MKT':
      return getMktFixedPayouts(
        contract,
        bets,
        liquidities,
        resolutions,
        resolutionProbability
      )
    default:
    case 'CANCEL':
      if (contract.mechanism === 'cpmm-2' && outcome !== 'CANCEL')
        return getStandardFixedPayouts(
          outcome ?? '',
          contract,
          bets,
          liquidities
        )

      return getFixedCancelPayouts(bets, liquidities)
  }
}

export const getDpmPayouts = (
  outcome: string | undefined,
  contract: DPMContract,
  bets: Bet[],
  resolutions?: {
    [outcome: string]: number
  },
  resolutionProbability?: number
): PayoutInfo => {
  const openBets = bets.filter((b) => !b.isSold && !b.sale)
  const { outcomeType } = contract

  switch (outcome) {
    case 'YES':
    case 'NO':
      return getDpmStandardPayouts(outcome, contract, openBets)

    case 'MKT':
      return outcomeType === 'FREE_RESPONSE' ||
        outcomeType === 'MULTIPLE_CHOICE' // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ? getPayoutsMultiOutcome(resolutions!, contract, openBets)
        : getDpmMktPayouts(contract, openBets, resolutionProbability)
    case 'CANCEL':
    case undefined:
      return getDpmCancelPayouts(contract, openBets)

    default:
      if (outcomeType === 'NUMERIC')
        throw new Error(
          'DPM distributional numeric outcomes no longer supported'
        )

      // Outcome is a free response answer id.
      return getDpmStandardPayouts(outcome, contract, openBets)
  }
}
