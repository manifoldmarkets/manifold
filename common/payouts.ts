import { sumBy, groupBy, mapValues } from 'lodash'

import { Bet, NumericBet } from './bet'
import {
  Binary,
  Contract,
  DPM,
  FixedPayouts,
  FreeResponse,
  FullContract,
  Multi,
  AnyOutcome,
} from './contract'
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
  outcome: string,
  resolutions: {
    [outcome: string]: number
  },
  contract: Contract,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability?: number
): PayoutInfo => {
  if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY') {
    return getFixedPayouts(
      outcome,
      contract,
      bets,
      liquidities,
      resolutionProbability
    )
  } else if (contract.mechanism === 'dpm-2') {
    return getDpmPayouts(
      outcome,
      resolutions,
      contract,
      bets,
      resolutionProbability
    )
  } else {
    throw new Error('Unknown contract mechanism.')
  }
}

export const getFixedPayouts = (
  outcome: string,
  contract: FullContract<FixedPayouts, Binary>,
  bets: Bet[],
  liquidities: LiquidityProvision[],
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
        resolutionProbability
      )
    default:
    case 'CANCEL':
      return getFixedCancelPayouts(bets, liquidities)
  }
}

export const getDpmPayouts = (
  outcome: string,
  resolutions: {
    [outcome: string]: number
  },
  contract: FullContract<DPM, AnyOutcome>,
  bets: Bet[],
  resolutionProbability?: number
): PayoutInfo => {
  const openBets = bets.filter((b) => !b.isSold && !b.sale)

  switch (outcome) {
    case 'YES':
    case 'NO':
      return getDpmStandardPayouts(outcome, contract, openBets)

    case 'MKT':
      return contract.outcomeType === 'FREE_RESPONSE'
        ? getPayoutsMultiOutcome(
            resolutions,
            contract as FullContract<DPM, Multi | FreeResponse>,
            openBets
          )
        : getDpmMktPayouts(contract, openBets, resolutionProbability)
    case 'CANCEL':
      return getDpmCancelPayouts(contract, openBets)

    default:
      if (contract.outcomeType === 'NUMERIC')
        return getNumericDpmPayouts(outcome, contract, openBets as NumericBet[])

      // Outcome is a free response answer id.
      return getDpmStandardPayouts(outcome, contract, openBets)
  }
}
