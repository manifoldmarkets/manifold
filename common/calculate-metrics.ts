import { Dictionary, partition, sumBy, uniq } from 'lodash'
import { calculatePayout, getContractBetMetrics } from './calculate'
import { Bet, LimitBet } from './bet'
import {
  Contract,
  CPMM2Contract,
  CPMMBinaryContract,
  CPMMContract,
  DPMContract,
} from './contract'
import { PortfolioMetrics, User } from './user'
import { DAY_MS } from './util/time'
import { getBinaryCpmmBetInfo, getNewMultiBetInfo } from './new-bet'
import { getCpmmProbability } from './calculate-cpmm'
import { removeUndefinedProps } from './util/object'
import { buy, getProb, shortSell } from './calculate-cpmm-multi'
import { average } from './util/math'

const computeInvestmentValue = (
  bets: Bet[],
  contractsDict: { [k: string]: Contract }
) => {
  return sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0

    let payout
    try {
      payout = calculatePayout(contract, bet, 'MKT')
    } catch (e) {
      console.log(
        'contract',
        contract.question,
        contract.mechanism,
        contract.id
      )
      console.error(e)
      payout = 0
    }
    const value = payout - (bet.loanAmount ?? 0)
    if (isNaN(value)) return 0
    return value
  })
}

export const computeInvestmentValueCustomProb = (
  bets: Bet[],
  contract: Contract,
  p: number
) => {
  return sumBy(bets, (bet) => {
    if (!contract) return 0
    if (bet.sale || bet.isSold) return 0
    const { outcome, shares } = bet

    const betP = outcome === 'YES' ? p : 1 - p

    const value = betP * shares
    if (isNaN(value)) return 0
    return value
  })
}

export const computeElasticity = (
  unfilledBets: LimitBet[],
  contract: Contract,
  betAmount = 50
) => {
  switch (contract.mechanism) {
    case 'cpmm-1':
      return computeBinaryCpmmElasticity(unfilledBets, contract, betAmount)
    case 'cpmm-2':
      return computeCPMM2Elasticity(contract, betAmount)
    case 'dpm-2':
      return computeDpmElasticity(contract, betAmount)
    default: // there are some contracts on the dev DB with crazy mechanisms
      return 0
  }
}

export const computeBinaryCpmmElasticity = (
  unfilledBets: LimitBet[],
  contract: CPMMContract,
  betAmount: number
) => {
  const sortedBets = unfilledBets.sort((a, b) => a.createdTime - b.createdTime)

  const userIds = uniq(unfilledBets.map((b) => b.userId))
  // Assume all limit orders are good.
  const userBalances = Object.fromEntries(
    userIds.map((id) => [id, Number.MAX_SAFE_INTEGER])
  )

  const { newPool: poolY, newP: pY } = getBinaryCpmmBetInfo(
    'YES',
    betAmount,
    contract,
    undefined,
    sortedBets,
    userBalances
  )
  const resultYes = getCpmmProbability(poolY, pY)

  const { newPool: poolN, newP: pN } = getBinaryCpmmBetInfo(
    'NO',
    betAmount,
    contract,
    undefined,
    sortedBets,
    userBalances
  )
  const resultNo = getCpmmProbability(poolN, pN)

  // handle AMM overflow
  const safeYes = Number.isFinite(resultYes) ? resultYes : 1
  const safeNo = Number.isFinite(resultNo) ? resultNo : 0

  return safeYes - safeNo
}

export const computeBinaryCpmmElasticityFromAnte = (
  ante: number,
  betAmount = 50
) => {
  const pool = { YES: ante, NO: ante }
  const p = 0.5
  const contract = { pool, p } as any

  const { newPool: poolY, newP: pY } = getBinaryCpmmBetInfo(
    'YES',
    betAmount,
    contract,
    undefined,
    [],
    {}
  )
  const resultYes = getCpmmProbability(poolY, pY)

  const { newPool: poolN, newP: pN } = getBinaryCpmmBetInfo(
    'NO',
    betAmount,
    contract,
    undefined,
    [],
    {}
  )
  const resultNo = getCpmmProbability(poolN, pN)

  // handle AMM overflow
  const safeYes = Number.isFinite(resultYes) ? resultYes : 1
  const safeNo = Number.isFinite(resultNo) ? resultNo : 0

  return safeYes - safeNo
}

export const computeCPMM2Elasticity = (
  contract: CPMM2Contract,
  betAmount: number
) => {
  const { pool, answers } = contract

  const probDiffs = answers.map((a) => {
    const { newPool: buyPool } = buy(pool, a.id, betAmount)
    const { newPool: sellPool } = shortSell(pool, a.id, betAmount)

    const buyProb = getProb(buyPool, a.id)
    const sellProb = getProb(sellPool, a.id)
    const safeBuy = Number.isFinite(buyProb) ? buyProb : 1
    const safeSell = Number.isFinite(sellProb) ? sellProb : 0
    return safeBuy - safeSell
  })

  return average(probDiffs)
}

export const computeDpmElasticity = (
  contract: DPMContract,
  betAmount: number
) => {
  return getNewMultiBetInfo('', 2 * betAmount, contract).newBet.probAfter
}

export const calculateCreatorTraders = (userContracts: Contract[]) => {
  let allTimeCreatorTraders = 0
  let dailyCreatorTraders = 0
  let weeklyCreatorTraders = 0
  let monthlyCreatorTraders = 0

  userContracts.forEach((contract) => {
    allTimeCreatorTraders += contract.uniqueBettorCount ?? 0
    dailyCreatorTraders += contract.uniqueBettors24Hours ?? 0
    weeklyCreatorTraders += contract.uniqueBettors7Days ?? 0
    monthlyCreatorTraders += contract.uniqueBettors30Days ?? 0
  })

  return {
    daily: dailyCreatorTraders,
    weekly: weeklyCreatorTraders,
    monthly: monthlyCreatorTraders,
    allTime: allTimeCreatorTraders,
  }
}

export const calculateNewPortfolioMetrics = (
  user: User,
  contractsById: { [k: string]: Contract },
  unresolvedBets: Bet[]
) => {
  const investmentValue = computeInvestmentValue(unresolvedBets, contractsById)
  const newPortfolio = {
    investmentValue: investmentValue,
    balance: user.balance,
    totalDeposits: user.totalDeposits,
    timestamp: Date.now(),
    userId: user.id,
  }
  return newPortfolio
}

const calculateProfitForPeriod = (
  startingPortfolio: PortfolioMetrics | undefined,
  currentProfit: number
) => {
  if (startingPortfolio === undefined) {
    return currentProfit
  }

  const startingProfit = calculatePortfolioProfit(startingPortfolio)

  return currentProfit - startingProfit
}

export const calculatePortfolioProfit = (portfolio: PortfolioMetrics) => {
  return portfolio.investmentValue + portfolio.balance - portfolio.totalDeposits
}

export const calculateNewProfit = (
  portfolioHistory: Record<
    'current' | 'day' | 'week' | 'month',
    PortfolioMetrics | undefined
  >,
  newPortfolio: PortfolioMetrics
) => {
  const allTimeProfit = calculatePortfolioProfit(newPortfolio)

  const newProfit = {
    daily: calculateProfitForPeriod(portfolioHistory.day, allTimeProfit),
    weekly: calculateProfitForPeriod(portfolioHistory.week, allTimeProfit),
    monthly: calculateProfitForPeriod(portfolioHistory.month, allTimeProfit),
    allTime: allTimeProfit,
  }

  return newProfit
}

export const calculateMetricsByContract = (
  betsByContractId: Dictionary<Bet[]>,
  contractsById: Dictionary<Contract>
) => {
  return Object.entries(betsByContractId).map(([contractId, bets]) => {
    const contract = contractsById[contractId]
    const current = getContractBetMetrics(contract, bets)

    let periodMetrics
    if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY') {
      const periods = ['day', 'week', 'month'] as const
      periodMetrics = Object.fromEntries(
        periods.map((period) => [
          period,
          calculatePeriodProfit(contract, bets, period),
        ])
      )
    }

    return removeUndefinedProps({ contractId, ...current, from: periodMetrics })
  })
}

export type ContractMetrics = ReturnType<
  typeof calculateMetricsByContract
>[number]

const calculatePeriodProfit = (
  contract: CPMMBinaryContract,
  bets: Bet[],
  period: 'day' | 'week' | 'month'
) => {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30
  const fromTime = Date.now() - days * DAY_MS
  const [previousBets, recentBets] = partition(
    bets,
    (b) => b.createdTime < fromTime
  )

  const { prob, probChanges } = contract
  const prevProb = prob - probChanges[period]

  const previousBetsValue = computeInvestmentValueCustomProb(
    previousBets,
    contract,
    prevProb
  )
  const currentBetsValue = computeInvestmentValueCustomProb(
    previousBets,
    contract,
    prob
  )

  const { profit: recentProfit, invested: recentInvested } =
    getContractBetMetrics(contract, recentBets)

  const profit = currentBetsValue - previousBetsValue + recentProfit
  const invested = previousBetsValue + recentInvested
  const profitPercent = invested === 0 ? 0 : 100 * (profit / invested)

  return {
    profit,
    profitPercent,
    invested,
    prevValue: previousBetsValue,
    value: currentBetsValue,
  }
}
