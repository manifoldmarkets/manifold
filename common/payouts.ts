import * as _ from 'lodash'

import { Bet } from './bet'
import { Contract, DPM, FreeResponse, FullContract, Multi } from './contract'
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

export const getPayouts = (
  outcome:
    | string
    | {
        [outcome: string]: number
      },
  contract: Contract,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability?: number
) => {
  if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY') {
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
      case 'CANCEL':
        return getFixedCancelPayouts(contract, bets, liquidities)
    }
  }

  switch (outcome) {
    case 'YES':
    case 'NO':
      return getDpmStandardPayouts(outcome, contract, bets)
    case 'MKT':
      return getDpmMktPayouts(contract, bets, resolutionProbability)
    case 'CANCEL':
      return getDpmCancelPayouts(contract, bets)
    default:
      // Multi outcome.
      return getPayoutsMultiOutcome(
        outcome as {
          [outcome: string]: number
        },
        contract as FullContract<DPM, Multi | FreeResponse>,
        bets
      )
  }
}

export const getLoanPayouts = (bets: Bet[]) => {
  const betsWithLoans = bets.filter((bet) => bet.loanAmount)
  const betsByUser = _.groupBy(betsWithLoans, (bet) => bet.userId)
  const loansByUser = _.mapValues(betsByUser, (bets) =>
    _.sumBy(bets, (bet) => -(bet.loanAmount ?? 0))
  )
  return _.toPairs(loansByUser).map(([userId, payout]) => ({ userId, payout }))
}
