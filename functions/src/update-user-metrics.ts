import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, isEqual, mapValues, sortBy } from 'lodash'

import { getValues, invokeFunction, log, revalidateStaticProps } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { PortfolioMetrics, User } from '../../common/user'
import { DAY_MS } from '../../common/util/time'
import { getUserLoanUpdates, isUserEligibleForLoan } from '../../common/loans'
import {
  calculateCreatorVolume,
  calculateNewPortfolioMetrics,
  calculateNewProfit,
  calculateMetricsByContract,
  calculateCreatorTraders,
} from '../../common/calculate-metrics'
import { batchedWaitAll } from '../../common/util/promise'
import { newEndpointNoAuth } from './api'

const BAD_RESOLUTION_THRESHOLD = 0.1

const firestore = admin.firestore()

export const scheduleUpdateUserMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updateusermetrics'))
    } catch (e) {
      console.error(e)
    }
  })

export const updateusermetrics = newEndpointNoAuth(
  { timeoutSeconds: 2000, memory: '16GiB', minInstances: 0 },
  async (_req) => {
    await updateUserMetrics()
    return { success: true }
  }
)

export async function updateUserMetrics() {
  log('Loading users...')
  const users = await getValues<User>(firestore.collection('users'))
  log(`Loaded ${users.length} users.`)

  log('Loading contracts...')
  const contracts = await getValues<Contract>(firestore.collection('contracts'))
  const contractsByCreator = groupBy(contracts, (c) => c.creatorId)
  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))
  log(`Loaded ${contracts.length} contracts.`)

  const now = Date.now()
  const monthAgo = now - DAY_MS * 30
  const writer = firestore.bulkWriter({ throttling: false })

  // we need to update metrics for contracts that resolved up through a month ago,
  // for the purposes of computing the daily/weekly/monthly profit on them
  const metricEligibleContracts = contracts.filter(
    (c) => c.resolutionTime == null || c.resolutionTime > monthAgo
  )
  log(`${metricEligibleContracts.length} contracts need metrics updates.`)

  log('Computing metric updates...')
  const userUpdates = await batchedWaitAll(
    users.map((user) => async () => {
      const userContracts = contractsByCreator[user.id] ?? []
      const metricRelevantBets = await loadUserContractBets(
        user.id,
        metricEligibleContracts
          .filter((c) => c.uniqueBettorIds?.includes(user.id))
          .map((c) => c.id)
      )
      const portfolioHistory = await loadPortfolioHistory(user.id, now)
      const newCreatorVolume = calculateCreatorVolume(userContracts)
      const newCreatorTraders = calculateCreatorTraders(userContracts)

      const newPortfolio = calculateNewPortfolioMetrics(
        user,
        contractsById,
        metricRelevantBets
      )
      const currPortfolio = portfolioHistory.current
      const didPortfolioChange =
        currPortfolio === undefined ||
        currPortfolio.balance !== newPortfolio.balance ||
        currPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
        currPortfolio.investmentValue !== newPortfolio.investmentValue

      const newProfit = calculateNewProfit(portfolioHistory, newPortfolio)

      const metricRelevantBetsByContract = groupBy(
        metricRelevantBets,
        (b) => b.contractId
      )

      const metricsByContract = calculateMetricsByContract(
        metricRelevantBetsByContract,
        contractsById
      )

      const contractRatios = userContracts
        .map((contract) => {
          if (
            !contract.flaggedByUsernames ||
            contract.flaggedByUsernames?.length === 0
          ) {
            return 0
          }
          const contractRatio =
            contract.flaggedByUsernames.length /
            (contract.uniqueBettorCount || 1)

          return contractRatio
        })
        .filter((ratio) => ratio > 0)
      const badResolutions = contractRatios.filter(
        (ratio) => ratio > BAD_RESOLUTION_THRESHOLD
      )
      let newFractionResolvedCorrectly = 1
      if (userContracts.length > 0) {
        newFractionResolvedCorrectly =
          (userContracts.length - badResolutions.length) / userContracts.length
      }

      const nextLoanPayout = isUserEligibleForLoan(newPortfolio)
        ? getUserLoanUpdates(metricRelevantBetsByContract, contractsById).payout
        : undefined

      const userDoc = firestore.collection('users').doc(user.id)
      if (didPortfolioChange) {
        writer.set(userDoc.collection('portfolioHistory').doc(), newPortfolio)
      }

      const contractMetricsCollection = userDoc.collection('contract-metrics')
      for (const metrics of metricsByContract) {
        writer.set(contractMetricsCollection.doc(metrics.contractId), metrics)
      }
      return {
        user: user,
        fields: {
          creatorVolumeCached: newCreatorVolume,
          creatorTraders: newCreatorTraders,
          profitCached: newProfit,
          nextLoanCached: nextLoanPayout ?? 0,
          fractionResolvedCorrectly: newFractionResolvedCorrectly,
        },
      }
    }),
    100
  )

  const periods = ['daily', 'weekly', 'monthly', 'allTime'] as const
  const periodRanksByUserId = periods.map((period) => {
    const rankedUpdates = sortBy(
      userUpdates,
      ({ fields }) => -fields.profitCached[period]
    )
    return Object.fromEntries(
      rankedUpdates.map((update, i) => [update.user.id, i + 1])
    )
  })

  for (const { user, fields } of userUpdates) {
    const profitRankCached = Object.fromEntries(
      periods.map((period, i) => {
        return [period, periodRanksByUserId[i][user.id]]
      })
    )
    const update = { profitRankCached, ...fields }
    const currValues = mapValues(
      update,
      (_, key: keyof typeof update) => user[key]
    )

    // Skip writing if nothing changed.
    if (!isEqual(currValues, update)) {
      const userDoc = firestore.collection('users').doc(user.id)
      writer.update(userDoc, update)
    }
  }

  log('Committing writes...')
  await writer.close()

  await revalidateStaticProps('/leaderboards')
  log('Done.')
}

const loadUserContractBets = async (userId: string, contractIds: string[]) => {
  const betDocs = await batchedWaitAll(
    contractIds.map((c) => async () => {
      return await firestore
        .collection('contracts')
        .doc(c)
        .collection('bets')
        .where('userId', '==', userId)
        .get()
    }),
    100
  )
  return betDocs
    .map((d) => d.docs)
    .flat()
    .map((d) => d.data() as Bet)
}

const loadPortfolioHistory = async (userId: string, now: number) => {
  const query = firestore
    .collection('users')
    .doc(userId)
    .collection('portfolioHistory')
    .orderBy('timestamp', 'desc')
    .limit(1)

  const portfolioMetrics = await Promise.all([
    getValues<PortfolioMetrics>(query),
    getValues<PortfolioMetrics>(query.where('timestamp', '<', now - DAY_MS)),
    getValues<PortfolioMetrics>(
      query.where('timestamp', '<', now - 7 * DAY_MS)
    ),
    getValues<PortfolioMetrics>(
      query.where('timestamp', '<', now - 30 * DAY_MS)
    ),
  ])
  const [current, day, week, month] = portfolioMetrics.map(
    (p) => p[0] as PortfolioMetrics | undefined
  )

  return {
    current,
    day,
    week,
    month,
  }
}
