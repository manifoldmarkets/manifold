import { Bet } from './bet'
import {
  calculateCpmmShares,
  getCpmmProbability,
  getCpmmProbabilityAfterBet,
} from './calculate-cpmm'
import {
  calculateDpmPayoutAfterCorrectBet,
  calculateDpmShares,
  getDpmOutcomeProbability,
  getDpmProbability,
  getDpmProbabilityAfterBet,
} from './calculate-dpm'
import { Binary, Contract, CPMM, DPM, FullContract } from './contract'
import { FEES } from './fees'

export function getProbability(contract: FullContract<DPM | CPMM, Binary>) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.pool)
    : getDpmProbability(contract.totalShares)
}

export function getOutcomeProbability(contract: Contract, outcome: string) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.pool)
    : getDpmOutcomeProbability(contract.totalShares, outcome)
}

export function getProbabilityAfterBet(
  contract: Contract,
  outcome: string,
  bet: number
) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbabilityAfterBet(
        contract as FullContract<CPMM, Binary>,
        outcome,
        bet
      )
    : getDpmProbabilityAfterBet(contract.totalShares, outcome, bet)
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

export function calculatePayoutAfterCorrectBet(contract: Contract, bet: Bet) {
  return contract.mechanism === 'cpmm-1'
    ? deductFees(bet.amount, bet.shares)
    : calculateDpmPayoutAfterCorrectBet(contract, bet)
}

export const deductFees = (betAmount: number, winnings: number) => {
  return winnings > betAmount
    ? betAmount + (1 - FEES) * (winnings - betAmount)
    : winnings
}
