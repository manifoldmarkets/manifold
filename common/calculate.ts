import { maxBy, sortBy, sum, sumBy } from 'lodash'
import { Bet, LimitBet } from './bet'
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
  Contract,
  BinaryContract,
  FreeResponseContract,
  PseudoNumericContract,
  MultipleChoiceContract,
} from './contract'
import { floatingEqual } from './util/math'

export function getProbability(
  contract: BinaryContract | PseudoNumericContract
) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbability(contract.pool, contract.p)
    : getDpmProbability(contract.totalShares)
}

export function getInitialProbability(
  contract: BinaryContract | PseudoNumericContract
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
    ? getCpmmOutcomeProbabilityAfterBet(contract, outcome, bet)
    : getDpmOutcomeProbabilityAfterBet(contract.totalShares, outcome, bet)
}

export function calculateShares(
  contract: Contract,
  bet: number,
  betChoice: string
) {
  return contract.mechanism === 'cpmm-1'
    ? calculateCpmmSharesAfterFee(contract, bet, betChoice)
    : calculateDpmShares(contract.totalShares, bet, betChoice)
}

export function calculateSaleAmount(
  contract: Contract,
  bet: Bet,
  unfilledBets: LimitBet[]
) {
  return contract.mechanism === 'cpmm-1' &&
    (contract.outcomeType === 'BINARY' ||
      contract.outcomeType === 'PSEUDO_NUMERIC')
    ? calculateCpmmSale(
        contract,
        Math.abs(bet.shares),
        bet.outcome as 'YES' | 'NO',
        unfilledBets
      ).saleValue
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
  shares: number,
  unfilledBets: LimitBet[]
) {
  return contract.mechanism === 'cpmm-1'
    ? getCpmmProbabilityAfterSale(
        contract,
        shares,
        outcome as 'YES' | 'NO',
        unfilledBets
      )
    : getDpmProbabilityAfterSale(contract.totalShares, outcome, shares)
}

export function calculatePayout(contract: Contract, bet: Bet, outcome: string) {
  return contract.mechanism === 'cpmm-1' &&
    (contract.outcomeType === 'BINARY' ||
      contract.outcomeType === 'PSEUDO_NUMERIC')
    ? calculateFixedPayout(contract, bet, outcome)
    : calculateDpmPayout(contract, bet, outcome)
}

export function resolvedPayout(contract: Contract, bet: Bet) {
  const outcome = contract.resolution
  if (!outcome) throw new Error('Contract not resolved')

  return contract.mechanism === 'cpmm-1' &&
    (contract.outcomeType === 'BINARY' ||
      contract.outcomeType === 'PSEUDO_NUMERIC')
    ? calculateFixedPayout(contract, bet, outcome)
    : calculateDpmPayout(contract, bet, outcome)
}

function getCpmmInvested(yourBets: Bet[]) {
  const totalShares: { [outcome: string]: number } = {}
  const totalSpent: { [outcome: string]: number } = {}

  const sortedBets = sortBy(yourBets, 'createdTime')
  for (const bet of sortedBets) {
    const { outcome, shares, amount } = bet
    if (floatingEqual(shares, 0)) continue

    const spent = totalSpent[outcome] ?? 0
    const position = totalShares[outcome] ?? 0

    if (amount > 0) {
      totalShares[outcome] = position + shares
      totalSpent[outcome] = spent + amount
    } else if (amount < 0) {
      const averagePrice = position === 0 ? 0 : spent / position
      totalShares[outcome] = position + shares
      totalSpent[outcome] = spent + averagePrice * shares
    }
  }

  return sum([0, ...Object.values(totalSpent)])
}

function getDpmInvested(yourBets: Bet[]) {
  const sortedBets = sortBy(yourBets, 'createdTime')

  return sumBy(sortedBets, (bet) => {
    const { amount, sale } = bet

    if (sale) {
      const originalBet = sortedBets.find((b) => b.id === sale.betId)
      if (originalBet) return -originalBet.amount
      return 0
    }

    return amount
  })
}

export function getContractBetMetrics(contract: Contract, yourBets: Bet[]) {
  const { resolution } = contract
  const isCpmm = contract.mechanism === 'cpmm-1'

  let totalInvested = 0
  let payout = 0
  let loan = 0
  let saleValue = 0
  let redeemed = 0
  const totalShares: { [outcome: string]: number } = {}

  for (const bet of yourBets) {
    const { isSold, sale, amount, loanAmount, isRedemption, shares, outcome } =
      bet
    totalShares[outcome] = (totalShares[outcome] ?? 0) + shares

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

      loan += loanAmount ?? 0
      payout += resolution
        ? calculatePayout(contract, bet, resolution)
        : calculatePayout(contract, bet, 'MKT')
    }
  }

  const netPayout = payout - loan
  const profit = payout + saleValue + redeemed - totalInvested
  const profitPercent = (profit / totalInvested) * 100

  const invested = isCpmm ? getCpmmInvested(yourBets) : getDpmInvested(yourBets)
  const hasShares = Object.values(totalShares).some(
    (shares) => !floatingEqual(shares, 0)
  )

  return {
    invested,
    payout,
    netPayout,
    profit,
    profitPercent,
    totalShares,
    hasShares,
  }
}

export function getContractBetNullMetrics() {
  return {
    invested: 0,
    payout: 0,
    netPayout: 0,
    profit: 0,
    profitPercent: 0,
    totalShares: {} as { [outcome: string]: number },
    hasShares: false,
  }
}

export function getTopAnswer(
  contract: FreeResponseContract | MultipleChoiceContract
) {
  const { answers } = contract
  const top = maxBy(
    answers?.map((answer) => ({
      answer,
      prob: getOutcomeProbability(contract, answer.id),
    })),
    ({ prob }) => prob
  )
  return top?.answer
}
