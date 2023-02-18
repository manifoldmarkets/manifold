import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { chunk, groupBy, sortBy, uniq } from 'lodash'

import {
  getUser,
  getValues,
  loadPaginated,
  log,
  revalidateStaticProps,
} from 'shared/utils'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import {
  calculateNewPortfolioMetrics,
  calculateNewProfit,
  calculateCreatorTraders,
  calculateMetricsByContract,
} from 'common/calculate-metrics'
import { hasChanges } from 'common/util/object'
import { CollectionReference } from 'firebase-admin/firestore'
import { filterDefined } from 'common/util/array'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { createSupabaseClient } from 'shared/supabase/init'
import { run, SupabaseClient } from 'common/supabase/utils'
import { JsonData } from 'common/supabase/json-data'

const firestore = admin.firestore()

export const scheduleUpdateUserMetrics = functions
  .runWith({
    memory: '4GB',
    timeoutSeconds: 540,

    secrets: ['API_SECRET', 'SUPABASE_KEY'],
  })
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    await updateUserMetrics()
  })

export async function updateUserMetrics() {
  log('Loading users...')
  const db = createSupabaseClient()

  const limit = 1000

  const { data: newUserData } = await run(
    db
      .from('users')
      .select('id')
      .filter('data->>metricsLastUpdated', 'is', null)
      .limit(limit)
  )
  const { data: userData } = await run(
    db
      .from('users')
      .select('id')
      .order('data->>metricsLastUpdated' as any, { ascending: true })
      .limit(limit - newUserData.length)
  )
  const userIds = uniq([...newUserData, ...userData].map((u) => u.id))
  await Promise.all(
    userIds.map((id) =>
      firestore.collection('users').doc(id).update({
        metricsLastUpdated: Date.now(),
      })
    )
  )

  log(`Loaded ${userIds.length} users.`)

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

  // We need to update metrics for contracts that resolved up through a month ago,
  // for the purposes of computing the daily/weekly/monthly profit on them
  const metricEligibleContracts = contracts.filter(
    (c) => c.resolutionTime == null || c.resolutionTime > monthAgo
  )
  log(`${metricEligibleContracts.length} contracts need metrics updates.`)

  log('Computing metric updates...')
  const userUpdates = []
  for (const userId of userIds) {
    const user = await getUser(userId)
    if (!user) {
      continue
    }
    const userContracts = contractsByCreator[user.id] ?? []
    const metricRelevantBets = await loadUserContractBets(
      db,
      user.id,
      metricEligibleContracts
        .filter((c) => c.uniqueBettorIds?.includes(user.id))
        .map((c) => c.id)
    ).catch((e) => {
      console.error(`Error fetching bets for user ${user.id}: ${e.message}`)
      return undefined
    })

    if (!metricRelevantBets) {
      continue
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

const loadUserContractBets = async (
  db: SupabaseClient,
  userId: string,
  contractIds: string[]
) => {
  const contractIdChunks = chunk(contractIds, 100)
  const bets: Bet[] = []
  for (const contractIdChunk of contractIdChunks) {
    const query = db
      .from('contract_bets')
      .select('data')
      .eq('data->>userId', userId)
      .in('contract_id', contractIdChunk)
    const { data } = (await run(query)) as any as { data: JsonData<Bet>[] }
    bets.push(...data.map((d) => d.data))
  }
  return sortBy(bets, (bet) => bet.createdTime)
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
