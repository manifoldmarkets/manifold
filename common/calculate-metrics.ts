import { last, sortBy, sum, sumBy } from 'lodash'
import { calculatePayout } from './calculate'
import { Bet } from './bet'
import { Contract } from './contract'
import { PortfolioMetrics, User } from './user'
import { DAY_MS } from './util/time'

const computeInvestmentValue = (
  bets: Bet[],
  contractsDict: { [k: string]: Contract }
) => {
  return sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0

    const payout = calculatePayout(contract, bet, 'MKT')
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
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0
    const { outcome, shares } = bet

    const betP = outcome === 'YES' ? p : 1 - p

    const payout = betP * shares
    const value = payout - (bet.loanAmount ?? 0)
    if (isNaN(value)) return 0
    return value
  })
}

const computeTotalPool = (userContracts: Contract[], startTime = 0) => {
  const periodFilteredContracts = userContracts.filter(
    (contract) => contract.createdTime >= startTime
  )
  return sum(
    periodFilteredContracts.map((contract) => sum(Object.values(contract.pool)))
  )
}

export const computeVolume = (contractBets: Bet[], since: number) => {
  return sumBy(contractBets, (b) =>
    b.createdTime > since && !b.isRedemption ? Math.abs(b.amount) : 0
  )
}

const calculateProbChangeSince = (descendingBets: Bet[], since: number) => {
  const newestBet = descendingBets[0]
  if (!newestBet) return 0

  const betBeforeSince = descendingBets.find((b) => b.createdTime < since)

  if (!betBeforeSince) {
    const oldestBet = last(descendingBets) ?? newestBet
    return newestBet.probAfter - oldestBet.probBefore
  }

  return newestBet.probAfter - betBeforeSince.probAfter
}

export const calculateProbChanges = (descendingBets: Bet[]) => {
  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const monthAgo = now - 30 * DAY_MS

  return {
    day: calculateProbChangeSince(descendingBets, yesterday),
    week: calculateProbChangeSince(descendingBets, weekAgo),
    month: calculateProbChangeSince(descendingBets, monthAgo),
  }
}

export const calculateCreatorVolume = (userContracts: Contract[]) => {
  const allTimeCreatorVolume = computeTotalPool(userContracts, 0)
  const monthlyCreatorVolume = computeTotalPool(
    userContracts,
    Date.now() - 30 * DAY_MS
  )
  const weeklyCreatorVolume = computeTotalPool(
    userContracts,
    Date.now() - 7 * DAY_MS
  )

  const dailyCreatorVolume = computeTotalPool(
    userContracts,
    Date.now() - 1 * DAY_MS
  )

  return {
    daily: dailyCreatorVolume,
    weekly: weeklyCreatorVolume,
    monthly: monthlyCreatorVolume,
    allTime: allTimeCreatorVolume,
  }
}

export const calculateNewPortfolioMetrics = (
  user: User,
  contractsById: { [k: string]: Contract },
  currentBets: Bet[]
) => {
  const investmentValue = computeInvestmentValue(currentBets, contractsById)
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
  startTime: number,
  descendingPortfolio: PortfolioMetrics[],
  currentProfit: number
) => {
  const startingPortfolio = descendingPortfolio.find(
    (p) => p.timestamp < startTime
  )

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
  portfolioHistory: PortfolioMetrics[],
  newPortfolio: PortfolioMetrics
) => {
  const allTimeProfit = calculatePortfolioProfit(newPortfolio)
  const descendingPortfolio = sortBy(
    portfolioHistory,
    (p) => p.timestamp
  ).reverse()

  const newProfit = {
    daily: calculateProfitForPeriod(
      Date.now() - 1 * DAY_MS,
      descendingPortfolio,
      allTimeProfit
    ),
    weekly: calculateProfitForPeriod(
      Date.now() - 7 * DAY_MS,
      descendingPortfolio,
      allTimeProfit
    ),
    monthly: calculateProfitForPeriod(
      Date.now() - 30 * DAY_MS,
      descendingPortfolio,
      allTimeProfit
    ),
    allTime: allTimeProfit,
  }

  return newProfit
}
