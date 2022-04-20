import * as _ from 'lodash'
import { Bet } from './bet'
import {
  calculateCpmmSale,
  getCpmmProbability,
  getCpmmOutcomeProbabilityAfterBet,
  getCpmmProbabilityAfterSale,
  calculateCpmmSharesAfterFee,
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
import { calculateFixedPayout } from './calculate-fixed-payouts'
import {
  Binary,
  Contract,
  CPMM,
  DPM,
  FreeResponseContract,
  FullContract,
} from './contract'

export function getProbability(contract: FullContract<DPM | CPMM, Binary>) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.pool, contract.p)
    : getDpmProbability(contract.totalShares)
}

export function getInitialProbability(
  contract: FullContract<DPM | CPMM, Binary>
) {
  if (contract.initialProbability) return contract.initialProbability

  if (contract.mechanism === 'dpm-2' || (contract as any).totalShares)
    // use totalShares to calculate prob for ported contracts
    return getDpmProbability(
      (contract as any).phantomShares ?? (contract as any).totalShares
    )

  return getCpmmProbability(contract.pool, contract.p)
}

export function getOutcomeProbability(contract: Contract, outcome: string) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.pool, contract.p)
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
    ? calculateCpmmSharesAfterFee(
        contract as FullContract<CPMM, Binary>,
        bet,
        betChoice
      )
    : calculateDpmShares(contract.totalShares, bet, betChoice)
}

export function calculateSaleAmount(contract: Contract, bet: Bet) {
  return contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY'
    ? calculateCpmmSale(contract, Math.abs(bet.shares), bet.outcome).saleValue
    : calculateDpmSaleAmount(contract, bet)
}

export function calculatePayoutAfterCorrectBet(contract: Contract, bet: Bet) {
  return contract.mechanism === 'cpmm-1'
    ? bet.shares
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
        shares,
        outcome as 'YES' | 'NO'
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

export function getContractBetMetrics(contract: Contract, yourBets: Bet[]) {
  const { resolution } = contract

  let currentInvested = 0
  let totalInvested = 0
  let payout = 0
  let loan = 0
  let saleValue = 0
  let redeemed = 0

  for (const bet of yourBets) {
    const { isSold, sale, amount, loanAmount, isRedemption } = bet
    if (isSold) {
      totalInvested += amount
    } else if (sale) {
      saleValue += sale.amount
    } else {
      if (isRedemption) {
        redeemed += -1 * amount
      } else if (amount > 0) {
        totalInvested += amount
      } else {
        saleValue -= amount
      }

      currentInvested += amount
      loan += loanAmount ?? 0
      payout += resolution
        ? calculatePayout(contract, bet, resolution)
        : calculatePayout(contract, bet, 'MKT')
    }
  }

  const netPayout = payout - loan
  const profit = payout + saleValue + redeemed - totalInvested
  const profitPercent = (profit / totalInvested) * 100

  return {
    invested: Math.max(0, currentInvested),
    payout,
    netPayout,
    profit,
    profitPercent,
  }
}

export function getContractBetNullMetrics() {
  return {
    invested: 0,
    payout: 0,
    netPayout: 0,
    profit: 0,
    profitPercent: 0,
  }
}

export function getTopAnswer(contract: FreeResponseContract) {
  const { answers } = contract
  const top = _.maxBy(
    answers.map((answer) => ({
      answer,
      prob: getOutcomeProbability(contract, answer.id),
    })),
    ({ prob }) => prob
  )
  return top?.answer
}
