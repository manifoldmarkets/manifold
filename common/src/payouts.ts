import { sumBy, groupBy, mapValues } from 'lodash'

import { Bet, NumericBet } from './bet'
import { Contract, CPMMContract, DPMContract } from './contract'
import { Fees } from './fees'
import { LiquidityProvision } from './liquidity-provision'
import {
  getDpmCancelPayouts,
  getDpmMktPayouts,
  getDpmStandardPayouts,
  getNumericDpmPayouts,
  getPayoutsMultiOutcome,
} from './payouts-dpm'
import {
  getFixedCancelPayouts,
  getMktFixedPayouts,
  getMultiFixedPayouts,
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
  if (contract.mechanism === 'cpmm-1') {
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
  if (contract.mechanism === 'cpmm-multi-1') {
    if (outcome === 'CANCEL') {
      return getFixedCancelPayouts(bets, liquidities)
    }
    if (!resolutions) {
      throw new Error('getPayouts: resolutions required for cpmm-multi-1')
    }
    // Includes equivalent of 'MKT' and 'YES/NO' resolutions.
    return getMultiFixedPayouts(contract, resolutions, bets, liquidities)
  }
  throw new Error('getPayouts not implemented')
}

export const getFixedPayouts = (
  outcome: string | undefined,
  contract: CPMMContract,
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
        return getNumericDpmPayouts(outcome, contract, openBets as NumericBet[])

      // Outcome is a free response answer id.
      return getDpmStandardPayouts(outcome, contract, openBets)
  }
}
