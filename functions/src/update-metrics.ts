import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, isEmpty, sum, sumBy } from 'lodash'
import { getValues, log, logMemory, writeAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { PortfolioMetrics, User } from '../../common/user'
import { calculatePayout } from '../../common/calculate'
import { DAY_MS } from '../../common/util/time'
import { last } from 'lodash'

const firestore = admin.firestore()

const computeInvestmentValue = (
  bets: Bet[],
  contractsDict: { [k: string]: Contract }
) => {
  return sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0

    const payout = calculatePayout(contract, bet, 'MKT')
    return payout - (bet.loanAmount ?? 0)
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

export const updateMetricsCore = async () => {
  const [users, contracts, bets, allPortfolioHistories] = await Promise.all([
    getValues<User>(firestore.collection('users')),
    getValues<Contract>(firestore.collection('contracts')),
    getValues<Bet>(firestore.collectionGroup('bets')),
    getValues<PortfolioMetrics>(
      firestore
        .collectionGroup('portfolioHistory')
        .where('timestamp', '>', Date.now() - 31 * DAY_MS) // so it includes just over a month ago
    ),
  ])
  log(
    `Loaded ${users.length} users, ${contracts.length} contracts, and ${bets.length} bets.`
  )
  logMemory()

  const now = Date.now()
  const betsByContract = groupBy(bets, (bet) => bet.contractId)
  const contractUpdates = contracts.map((contract) => {
    const contractBets = betsByContract[contract.id] ?? []
    return {
      doc: firestore.collection('contracts').doc(contract.id),
      fields: {
        volume24Hours: computeVolume(contractBets, now - DAY_MS),
        volume7Days: computeVolume(contractBets, now - DAY_MS * 7),
      },
    }
  })
  await writeAsync(firestore, contractUpdates)
  log(`Updated metrics for ${contracts.length} contracts.`)

  const contractsById = Object.fromEntries(
    contracts.map((contract) => [contract.id, contract])
  )
  const contractsByUser = groupBy(contracts, (contract) => contract.creatorId)
  const betsByUser = groupBy(bets, (bet) => bet.userId)
  const portfolioHistoryByUser = groupBy(allPortfolioHistories, (p) => p.userId)
  const userUpdates = users.map((user) => {
    const currentBets = betsByUser[user.id] ?? []
    const portfolioHistory = portfolioHistoryByUser[user.id] ?? []
    const userContracts = contractsByUser[user.id] ?? []
    const newCreatorVolume = calculateCreatorVolume(userContracts)
    const newPortfolio = calculateNewPortfolioMetrics(
      user,
      contractsById,
      currentBets
    )
    const lastPortfolio = last(portfolioHistory)
    const didProfitChange =
      lastPortfolio === undefined ||
      lastPortfolio.balance !== newPortfolio.balance ||
      lastPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
      lastPortfolio.investmentValue !== newPortfolio.investmentValue

    const newProfit = calculateNewProfit(
      portfolioHistory,
      newPortfolio,
      didProfitChange
    )

    return {
      fieldUpdates: {
        doc: firestore.collection('users').doc(user.id),
        fields: {
          creatorVolumeCached: newCreatorVolume,
          ...(didProfitChange && {
            profitCached: newProfit,
          }),
        },
      },

      subcollectionUpdates: {
        doc: firestore
          .collection('users')
          .doc(user.id)
          .collection('portfolioHistory')
          .doc(),
        fields: {
          ...(didProfitChange && {
            ...newPortfolio,
          }),
        },
      },
    }
  })
  await writeAsync(
    firestore,
    userUpdates.map((u) => u.fieldUpdates)
  )
  await writeAsync(
    firestore,
    userUpdates
      .filter((u) => !isEmpty(u.subcollectionUpdates.fields))
      .map((u) => u.subcollectionUpdates),
    'set'
  )
  log(`Updated metrics for ${users.length} users.`)
}

const computeVolume = (contractBets: Bet[], since: number) => {
  return sumBy(contractBets, (b) =>
    b.createdTime > since && !b.isRedemption ? Math.abs(b.amount) : 0
  )
}

const calculateProfitForPeriod = (
  startTime: number,
  portfolioHistory: PortfolioMetrics[],
  currentProfit: number
) => {
  const startingPortfolio = [...portfolioHistory]
    .reverse() // so we search in descending order (most recent first), for efficiency
    .find((p) => p.timestamp < startTime)

  if (startingPortfolio === undefined) {
    return 0
  }

  const startingProfit = calculateTotalProfit(startingPortfolio)

  return currentProfit - startingProfit
}

const calculateTotalProfit = (portfolio: PortfolioMetrics) => {
  return portfolio.investmentValue + portfolio.balance - portfolio.totalDeposits
}

const calculateCreatorVolume = (userContracts: Contract[]) => {
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

const calculateNewPortfolioMetrics = (
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

const calculateNewProfit = (
  portfolioHistory: PortfolioMetrics[],
  newPortfolio: PortfolioMetrics,
  didProfitChange: boolean
) => {
  if (!didProfitChange) {
    return {} // early return for performance
  }

  const allTimeProfit = calculateTotalProfit(newPortfolio)
  const newProfit = {
    daily: calculateProfitForPeriod(
      Date.now() - 1 * DAY_MS,
      portfolioHistory,
      allTimeProfit
    ),
    weekly: calculateProfitForPeriod(
      Date.now() - 7 * DAY_MS,
      portfolioHistory,
      allTimeProfit
    ),
    monthly: calculateProfitForPeriod(
      Date.now() - 30 * DAY_MS,
      portfolioHistory,
      allTimeProfit
    ),
    allTime: allTimeProfit,
  }

  return newProfit
}

export const updateMetrics = functions
  .runWith({ memory: '1GB', timeoutSeconds: 540 })
  .pubsub.schedule('every 15 minutes')
  .onRun(updateMetricsCore)
