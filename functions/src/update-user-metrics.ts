import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, sortBy } from 'lodash'

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

  log('Computing metric updates...')
  const now = Date.now()
  const writer = firestore.bulkWriter({ throttling: false })
  const userUpdates = await batchedWaitAll(
    users.map((user) => async () => {
      const userContracts = contractsByCreator[user.id] ?? []
      const currentBets = (
        await firestore
          .collectionGroup('bets')
          .where('userId', '==', user.id)
          .get()
      ).docs.map((d) => d.data() as Bet)
      const betsByContractId = groupBy(currentBets, (b) => b.contractId)
      const portfolioHistory = await loadPortfolioHistory(user.id, now)
      const newCreatorVolume = calculateCreatorVolume(userContracts)
      const newPortfolio = calculateNewPortfolioMetrics(
        user,
        contractsById,
        currentBets
      )
      const currPortfolio = portfolioHistory.current
      const didPortfolioChange =
        currPortfolio === undefined ||
        currPortfolio.balance !== newPortfolio.balance ||
        currPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
        currPortfolio.investmentValue !== newPortfolio.investmentValue

      const newProfit = calculateNewProfit(portfolioHistory, newPortfolio)

      const metricsByContract = calculateMetricsByContract(
        betsByContractId,
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
        ? getUserLoanUpdates(betsByContractId, contractsById).payout
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
    const userDoc = firestore.collection('users').doc(user.id)
    writer.update(userDoc, { profitRankCached, ...fields })
  }

  log('Committing writes...')
  await writer.close()

  await revalidateStaticProps('/leaderboards')
  log('Done.')
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
