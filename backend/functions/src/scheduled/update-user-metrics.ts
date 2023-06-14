import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, mapValues, uniq } from 'lodash'

import { log, revalidateStaticProps } from 'shared/utils'
import { Bet } from 'common/bet'
import { CPMMMultiContract, Contract } from 'common/contract'
import { User } from 'common/user'
import { DAY_MS } from 'common/util/time'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import {
  calculateNewPortfolioMetrics,
  calculateMetricsByContract,
} from 'common/calculate-metrics'
import { hasChanges } from 'common/util/object'
import { filterDefined } from 'common/util/array'
import {
  SupabaseDirectClient,
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { bulkInsert } from 'shared/supabase/utils'
import { secrets } from 'common/secrets'
import { getAnswersForContracts } from 'common/supabase/contracts'

const firestore = admin.firestore()

export const updateUserMetrics = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    await updateUserMetricsCore()
  })

export async function updateUserMetricsCore() {
  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - DAY_MS * 7
  const monthAgo = now - DAY_MS * 30
  const pg = createSupabaseDirectClient()
  const db = createSupabaseClient()
  const writer = firestore.bulkWriter()

  log('Loading users...')
  const users = await pg.map(
    `select data from users order by data->'metricsLastUpdated' asc nulls first limit 5000`,
    [],
    (r) => r.data as User
  )
  const userIds = users.map((u) => u.id)
  for (const userId of userIds) {
    const doc = firestore.collection('users').doc(userId)
    writer.update(doc, { metricsLastUpdated: now })
  }
  log(`Loaded ${userIds.length} users.`)

  log('Loading creator trader counts...')
  const [yesterdayTraders, weeklyTraders, monthlyTraders, allTimeTraders] =
    await Promise.all(
      [yesterday, weekAgo, monthAgo, undefined].map((t) =>
        getCreatorTraders(pg, userIds, t)
      )
    )
  log(`Loaded creator trader counts.`)

  log('Loading current portfolio snapshot...')
  const currPortfolios = await getPortfolioSnapshot(pg, userIds)
  log(`Loaded current portfolio snapshot.`)

  log('Loading portfolio historical profits...')
  const [yesterdayProfits, weeklyProfits, monthlyProfits] = await Promise.all(
    [yesterday, weekAgo, monthAgo].map((t) =>
      getPortfolioHistoricalProfits(pg, userIds, t)
    )
  )
  log(`Loaded portfolio historical profits.`)

  log('Loading bets...')
  const metricRelevantBets = await getMetricRelevantUserBets(
    pg,
    userIds,
    monthAgo
  )
  log('Loaded bets.')

  log('Loading contracts...')
  const allBets = Object.values(metricRelevantBets).flat()
  const contracts = await getRelevantContracts(pg, allBets)
  const answersByContractId = await getAnswersForContracts(
    db,
    contracts.filter((c) => c.mechanism === 'cpmm-multi-1').map((c) => c.id)
  )
  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))

  for (const [contractId, answers] of Object.entries(answersByContractId)) {
    // Denormalize answers onto the contract.
    ;(contractsById[contractId] as CPMMMultiContract).answers = answers
  }

  log(`Loaded ${contracts.length} contracts.`)

  // We need to update metrics for contracts that resolved up through a month ago,
  // for the purposes of computing the daily/weekly/monthly profit on them
  const metricEligibleContracts = contracts.filter(
    (c) => c.resolutionTime == null || c.resolutionTime > monthAgo
  )
  log(`${metricEligibleContracts.length} contracts need metrics updates.`)

  log('Computing metric updates...')
  const userUpdates = []
  const portfolioUpdates = []
  for (const user of users) {
    const userMetricRelevantBets = metricRelevantBets[user.id] ?? []
    const currPortfolio = currPortfolios[user.id]
    const creatorTraders = {
      daily: yesterdayTraders[user.id] ?? 0,
      weekly: weeklyTraders[user.id] ?? 0,
      monthly: monthlyTraders[user.id] ?? 0,
      allTime: allTimeTraders[user.id] ?? 0,
    }
    const newPortfolio = calculateNewPortfolioMetrics(
      user,
      contractsById,
      userMetricRelevantBets
    )
    const didPortfolioChange =
      currPortfolio === undefined ||
      currPortfolio.balance !== newPortfolio.balance ||
      currPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
      currPortfolio.investmentValue !== newPortfolio.investmentValue

    const allTimeProfit =
      newPortfolio.balance +
      newPortfolio.investmentValue -
      newPortfolio.totalDeposits
    const newProfit = {
      daily: allTimeProfit - (yesterdayProfits[user.id] ?? allTimeProfit),
      weekly: allTimeProfit - (weeklyProfits[user.id] ?? allTimeProfit),
      monthly: allTimeProfit - (monthlyProfits[user.id] ?? allTimeProfit),
      allTime: allTimeProfit,
    }

    const metricRelevantBetsByContract = groupBy(
      userMetricRelevantBets,
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
      portfolioUpdates.push({
        user_id: user.id,
        portfolio_id: userDoc.collection('portfolioHistory').doc().id,
        ts: new Date(newPortfolio.timestamp).toISOString(),
        investment_value: newPortfolio.investmentValue,
        balance: newPortfolio.balance,
        total_deposits: newPortfolio.totalDeposits,
      })
    }

    const contractMetricsCollection = userDoc.collection('contract-metrics')
    for (const metrics of metricsByContract) {
      writer.set(contractMetricsCollection.doc(metrics.contractId), metrics)
    }

    userUpdates.push({
      user: user,
      fields: {
        creatorTraders: creatorTraders,
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

  log('Inserting Supabase portfolio history entries...')
  if (portfolioUpdates.length > 0) {
    await bulkInsert(pg, 'user_portfolio_history', portfolioUpdates)
  }

  log('Committing Firestore writes...')
  await writer.close()

  await revalidateStaticProps('/leaderboards')
  log('Done.')
}

const getRelevantContracts = async (pg: SupabaseDirectClient, bets: Bet[]) => {
  const betContractIds = uniq(bets.map((b) => b.contractId))
  return await pg.map(
    `select data from contracts where id in ($1:list)`,
    [betContractIds],
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
    where cb.user_id in ($1:list) and (c.resolution_time is null or c.resolution_time > $2)
    order by cb.created_time asc`,
    [userIds, new Date(since).toISOString()]
  )
  return mapValues(
    groupBy(bets, (r) => r.data.userId as string),
    (rows) => rows.map((r) => r.data as Bet)
  )
}

const getPortfolioSnapshot = async (
  pg: SupabaseDirectClient,
  userIds: string[]
) => {
  return Object.fromEntries(
    await pg.map(
      `select distinct on (user_id) user_id, investment_value, balance, total_deposits
      from user_portfolio_history
      where user_id in ($1:list)
      order by user_id, ts desc`,
      [userIds],
      (r) => [
        r.user_id as string,
        {
          userId: r.user_id as string,
          investmentValue: parseFloat(r.investment_value as string),
          balance: parseFloat(r.balance as string),
          totalDeposits: parseFloat(r.total_deposits as string),
        },
      ]
    )
  )
}

const getPortfolioHistoricalProfits = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  when: number
) => {
  return Object.fromEntries(
    await pg.map(
      `select distinct on (user_id) user_id, investment_value + balance - total_deposits as profit
      from user_portfolio_history
      where ts < $2 and user_id in ($1:list)
      order by user_id, ts desc`,
      [userIds, new Date(when).toISOString()],
      (r) => [r.user_id as string, parseFloat(r.profit as string)]
    )
  )
}

const getCreatorTraders = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  since?: number
) => {
  return Object.fromEntries(
    await pg.map(
      `with contract_traders as (
        select distinct contract_id, user_id from contract_bets where created_time >= $2
      )
      select c.creator_id, count(ct.*)::int as total
      from contracts as c
      join contract_traders as ct on c.id = ct.contract_id
      where c.creator_id in ($1:list)
      group by c.creator_id`,
      [userIds, new Date(since ?? 0).toISOString()],
      (r) => [r.creator_id as string, r.total as number]
    )
  )
}
