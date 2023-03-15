import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, mapValues, uniq } from 'lodash'

import { log, revalidateStaticProps } from 'shared/utils'
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
import { hasChanges } from 'common/util/object'
import { filterDefined } from 'common/util/array'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { secrets } from 'functions/secrets'

const firestore = admin.firestore()

export const updateUserMetrics = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    await updateUserMetricsCore()
  })

export async function updateUserMetricsCore() {
  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - DAY_MS * 7
  const monthAgo = now - DAY_MS * 30
  const pg = createSupabaseDirectClient()
  const writer = firestore.bulkWriter()

  log('Loading users...')
  const users = await pg.map(
    `select data from users order by data->'metricsLastUpdated' asc nulls first limit 500`,
    [],
    (r) => r.data as User
  )
  const userIds = users.map((u) => u.id)
  for (const userId of userIds) {
    const doc = firestore.collection('users').doc(userId)
    writer.update(doc, { metricsLastUpdated: now })
  }
  log(`Loaded ${userIds.length} users.`)

  log('Loading portfolio history snapshots...')
  const [
    currentPortfolioSnapshots,
    yesterdayPortfolioSnapshots,
    weekAgoPortfolioSnapshots,
    monthAgoPortfolioSnapshots,
  ] = await Promise.all(
    [now, yesterday, weekAgo, monthAgo].map((t) =>
      getPortfolioHistorySnapshots(pg, userIds, t)
    )
  )
  log(`Loaded portfolio history snapshots.`)

  log('Loading bets...')
  const metricRelevantBets = await getMetricRelevantUserBets(
    pg,
    userIds,
    monthAgo
  )
  log('Loaded bets.')

  log('Loading contracts...')
  const allBets = Object.values(metricRelevantBets).flat()
  const contracts = await getRelevantContracts(pg, userIds, allBets)
  const contractsByCreator = groupBy(contracts, (c) => c.creatorId)
  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))
  log(`Loaded ${contracts.length} contracts.`)

  // We need to update metrics for contracts that resolved up through a month ago,
  // for the purposes of computing the daily/weekly/monthly profit on them
  const metricEligibleContracts = contracts.filter(
    (c) => c.resolutionTime == null || c.resolutionTime > monthAgo
  )
  log(`${metricEligibleContracts.length} contracts need metrics updates.`)

  log('Computing metric updates...')
  const userUpdates = []
  for (const user of users) {
    const userContracts = contractsByCreator[user.id] ?? []
    const newMetricRelevantBets = metricRelevantBets[user.id] ?? []

    const newPortfolioHistory = {
      current: currentPortfolioSnapshots[user.id],
      day: yesterdayPortfolioSnapshots[user.id],
      week: weekAgoPortfolioSnapshots[user.id],
      month: monthAgoPortfolioSnapshots[user.id],
    }

    const newCreatorTraders = calculateCreatorTraders(userContracts)

    const newPortfolio = calculateNewPortfolioMetrics(
      user,
      contractsById,
      newMetricRelevantBets
    )
    const currPortfolio = newPortfolioHistory.current
    const didPortfolioChange =
      currPortfolio === undefined ||
      currPortfolio.balance !== newPortfolio.balance ||
      currPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
      currPortfolio.investmentValue !== newPortfolio.investmentValue

    const newProfit = calculateNewProfit(newPortfolioHistory, newPortfolio)

    const metricRelevantBetsByContract = groupBy(
      newMetricRelevantBets,
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

    userUpdates.push({
      user: user,
      fields: {
        creatorTraders: newCreatorTraders,
        profitCached: newProfit,
        nextLoanCached: nextLoanPayout ?? 0,
      },
    })
  }

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

const getRelevantContracts = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  bets: Bet[]
) => {
  const betContractIds = uniq(bets.map((b) => b.contractId))
  return await pg.map(
    `select data
    from contracts
    where data->>'creatorId' in ($1:list)
    or id in ($2:list)`,
    [userIds, betContractIds],
    (r) => r.data as Contract
  )
}

const getMetricRelevantUserBets = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since: number
) => {
  const bets = await pg.manyOrNone(
    `select cb.data
    from contract_bets as cb
    join contracts as c on cb.contract_id = c.id
    where
      cb.data->>'userId' in ($1:list) and
      (not (c.data ? 'resolutionTime') or c.data->>'resolutionTime' > $2::text) and
      c.data->'uniqueBettorIds' ? (cb.data->>'userId')::text
    order by (cb.data->'createdTime')::bigint asc`,
    [userIds, since]
  )
  return mapValues(
    groupBy(bets, (r) => r.data.userId as string),
    (rows) => rows.map((r) => r.data as Bet)
  )
}

const getPortfolioHistorySnapshots = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  when: number
) => {
  return Object.fromEntries(
    await pg.map(
      `select distinct on (user_id) user_id, data
      from user_portfolio_history
      where (data->'timestamp')::bigint < $2 and user_id in ($1:list)
      order by user_id, (data->'timestamp')::bigint desc`,
      [userIds, when],
      (r) => [r.user_id as string, r.data as PortfolioMetrics]
    )
  )
}
