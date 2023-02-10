import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy } from 'lodash'

import {
  getUser,
  getValues,
  invokeFunction,
  loadPaginated,
  log,
  revalidateStaticProps,
} from 'shared/utils'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { DAY_MS } from 'common/util/time'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import {
  calculateNewPortfolioMetrics,
  calculateNewProfit,
  calculateCreatorTraders,
  calculateMetricsByContract,
} from 'common/calculate-metrics'
import { mapAsync } from 'common/util/promise'
import { hasChanges } from 'common/util/object'
import { newEndpointNoAuth } from './api'
import { CollectionReference, Query } from 'firebase-admin/firestore'
import { filterDefined } from 'common/util/array'
import { PortfolioMetrics } from 'common/portfolio-metrics'

const firestore = admin.firestore()

export const scheduleUpdateUserMetrics = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updateusermetrics'))
    } catch (e) {
      console.error(e)
    }
  })

export const updateusermetrics = newEndpointNoAuth(
  {
    timeoutSeconds: 3600,
    memory: '16GiB',
    minInstances: 1,
    secrets: ['API_SECRET', 'SUPABASE_KEY'],
  },
  async (_req) => {
    await updateUserMetrics()
    return { success: true }
  }
)

export async function updateUserMetrics() {
  log('Loading users...')
  const users = await loadPaginated(
    firestore.collection('users') as CollectionReference<User>
  )
  log(`Loaded ${users.length} users.`)

  log('Loading contracts...')
  const contracts = await loadPaginated(
    firestore.collection('contracts') as CollectionReference<Contract>
  )
  const contractsByCreator = groupBy(contracts, (c) => c.creatorId)
  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))
  log(`Loaded ${contracts.length} contracts.`)

  const now = Date.now()
  const monthAgo = now - DAY_MS * 30
  const writer = firestore.bulkWriter()

  // we need to update metrics for contracts that resolved up through a month ago,
  // for the purposes of computing the daily/weekly/monthly profit on them
  const metricEligibleContracts = contracts.filter(
    (c) => c.resolutionTime == null || c.resolutionTime > monthAgo
  )
  log(`${metricEligibleContracts.length} contracts need metrics updates.`)

  log('Computing metric updates...')
  const userUpdates = await mapAsync(
    users,
    async (staleUser) => {
      const user = (await getUser(staleUser.id)) ?? staleUser
      const userContracts = contractsByCreator[user.id] ?? []
      const metricRelevantBets = await loadUserContractBets(
        user.id,
        metricEligibleContracts
          .filter((c) => c.uniqueBettorIds?.includes(user.id))
          .map((c) => c.id)
      ).catch((e) => {
        console.error(`Error fetching bets for user ${user.id}: ${e.message}`)
        return undefined
      })

      if (!metricRelevantBets) {
        return undefined
      }

      const portfolioHistory = await loadPortfolioHistory(user.id, now)
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
        contractsById,
        user
      )

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
          creatorTraders: newCreatorTraders,
          profitCached: newProfit,
          nextLoanCached: nextLoanPayout ?? 0,
        },
      }
    },
    10
  )

  for (const { user, fields } of filterDefined(userUpdates)) {
    if (hasChanges(user, fields)) {
      writer.update(firestore.collection('users').doc(user.id), fields)
    }
  }

  log('Committing writes...')
  await writer.close()

  await revalidateStaticProps('/leaderboards')
  log('Done.')
}

const loadUserContractBets = async (userId: string, contractIds: string[]) => {
  const bets = []
  for (const cid of contractIds) {
    bets.push(
      ...(await loadPaginated(
        firestore
          .collection('contracts')
          .doc(cid)
          .collection('bets')
          .where('userId', '==', userId) as Query<Bet>
      ))
    )
  }
  return bets
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
