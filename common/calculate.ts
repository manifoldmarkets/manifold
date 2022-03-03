import { Bet } from './bet'
import {
  calculateCpmmShares,
  calculateCpmmShareValue,
  getCpmmProbability,
  getCpmmOutcomeProbabilityAfterBet,
  getCpmmProbabilityAfterSale,
} from './calculate-cpmm'
import {
  calculateDpmPayout,
  calculateDpmPayoutAfterCorrectBet,
  calculateDpmSaleAmount,
  calculateDpmShares,
  getDpmOutcomeProbability,
  getDpmProbability,
  getDpmOutcomeProbabilityAfterBet,
  getDpmProbabilityAfterSale,
} from './calculate-dpm'
import {
  calculateFixedPayout,
  deductFixedFees,
} from './calculate-fixed-payouts'
import { Binary, Contract, CPMM, DPM, FullContract } from './contract'

export function getProbability(contract: FullContract<DPM | CPMM, Binary>) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.pool)
    : getDpmProbability(contract.totalShares)
}

export function getInitialProbability(
  contract: FullContract<DPM | CPMM, Binary>
) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.liquidity[contract.creatorId])
    : getDpmProbability(contract.phantomShares ?? contract.totalShares)
}

export function getOutcomeProbability(contract: Contract, outcome: string) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.pool)
    : getDpmOutcomeProbability(contract.totalShares, outcome)
}

export function getOutcomeProbabilityAfterBet(
  contract: Contract,
  outcome: string,
  bet: number
) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmOutcomeProbabilityAfterBet(
        contract as FullContract<CPMM, Binary>,
        outcome,
        bet
      )
    : getDpmOutcomeProbabilityAfterBet(contract.totalShares, outcome, bet)
}

export function calculateShares(
  contract: Contract,
  bet: number,
  betChoice: string
) {
  return contract.mechanism === 'cpmm-1'
    ? calculateCpmmShares(contract.pool, contract.k, bet, betChoice)
    : calculateDpmShares(contract.totalShares, bet, betChoice)
}

export function calculateSaleAmount(contract: Contract, bet: Bet) {
  return contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY'
    ? deductFixedFees(
        bet.amount,
        calculateCpmmShareValue(contract, bet.shares, bet.outcome)
      )
    : calculateDpmSaleAmount(contract, bet)
}

export function calculatePayoutAfterCorrectBet(contract: Contract, bet: Bet) {
  return contract.mechanism === 'cpmm-1'
    ? deductFixedFees(bet.amount, bet.shares)
    : calculateDpmPayoutAfterCorrectBet(contract, bet)
}

export function getProbabilityAfterSale(
  contract: Contract,
  outcome: string,
  shares: number
) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbabilityAfterSale(
        contract as FullContract<CPMM, Binary>,
        { shares, outcome } as Bet
      )
    : getDpmProbabilityAfterSale(contract.totalShares, outcome, shares)
}

export function calculatePayout(contract: Contract, bet: Bet, outcome: string) {
  return contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY'
    ? calculateFixedPayout(contract, bet, outcome)
    : calculateDpmPayout(contract, bet, outcome)
}

export function resolvedPayout(contract: Contract, bet: Bet) {
  const outcome = contract.resolution
  if (!outcome) throw new Error('Contract not resolved')

  return contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY'
    ? calculateFixedPayout(contract, bet, outcome)
    : calculateDpmPayout(contract, bet, outcome)
}
