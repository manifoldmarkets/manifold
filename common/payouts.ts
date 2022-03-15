import * as _ from 'lodash'

import { Bet } from './bet'
import {
  Binary,
  Contract,
  DPM,
  FixedPayouts,
  FreeResponse,
  FullContract,
  Multi,
} from './contract'
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
  const betsByUser = _.groupBy(betsWithLoans, (bet) => bet.userId)
  const loansByUser = _.mapValues(betsByUser, (bets) =>
    _.sumBy(bets, (bet) => -(bet.loanAmount ?? 0))
  )
  return _.toPairs(loansByUser).map(([userId, payout]) => ({ userId, payout }))
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
): [Payout[], Fees] => {
  if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY') {
    const payouts = getFixedPayouts(
      outcome,
      contract,
      bets,
      liquidities,
      resolutionProbability
    )
    return [payouts, contract.collectedFees]
  }

  return getDpmPayouts(
    outcome,
    resolutions,
    contract,
    bets,
    resolutionProbability
  )
}

export const getFixedPayouts = (
  outcome: string,
  contract: FullContract<FixedPayouts, Binary>,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability?: number
): Payout[] => {
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
  contract: Contract,
  bets: Bet[],
  resolutionProbability?: number
) => {
  const openBets = bets.filter((b) => !b.isSold && !b.sale)

  switch (outcome) {
    case 'YES':
    case 'NO':
      return getDpmStandardPayouts(outcome, contract, openBets) as [
        Payout[],
        Fees
      ]

    case 'MKT':
      return getDpmMktPayouts(contract, openBets, resolutionProbability) as [
        Payout[],
        Fees
      ]

    case 'CANCEL':
      return getDpmCancelPayouts(contract, openBets) as [Payout[], Fees]

    default:
      if (outcome)
        // single outcome free response
        return getDpmStandardPayouts(outcome, contract, openBets) as [
          Payout[],
          Fees
        ]

      // Multi outcome.
      return getPayoutsMultiOutcome(
        resolutions,
        contract as FullContract<DPM, Multi | FreeResponse>,
        openBets
      ) as [Payout[], Fees]
  }
}
