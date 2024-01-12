import { DAY_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { revalidateStaticProps } from 'shared/utils'
import { User } from 'common/user'
import { groupBy, mapValues, sumBy, uniq } from 'lodash'
import { Contract, CPMMMultiContract } from 'common/contract'
import {
  calculateMetricsByContractAndAnswer,
  calculateNewPortfolioMetrics,
} from 'common/calculate-metrics'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import { filterDefined } from 'common/util/array'
import { hasChanges } from 'common/util/object'
import { bulkInsert } from 'shared/supabase/utils'
import { Bet } from 'common/bet'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import * as admin from 'firebase-admin'
import { JobContext } from 'shared/utils'
import { getAnswersForContractsDirect } from 'shared/supabase/answers'

export async function updateUserMetricsCore({ log }: JobContext) {
  const firestore = admin.firestore()
  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - DAY_MS * 7
  const monthAgo = now - DAY_MS * 30
  const pg = createSupabaseDirectClient()
  const writer = firestore.bulkWriter()

  log('Loading users...')
  const users = await pg.map(
    `select data from users 
            order by data->'metricsLastUpdated' nulls first limit 5000`,
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

  // We need to update metrics for contracts that resolved up through a month ago,
  // for the purposes of computing the daily/weekly/monthly profit on them
  const metricRelevantBets = await getMetricRelevantUserBets(
    pg,
    userIds,
    monthAgo
  )
  log(
    `Loaded ${sumBy(
      Object.values(metricRelevantBets),
      (bets) => bets.length
    )} bets.`
  )

  log('Loading contracts...')
  const allBets = Object.values(metricRelevantBets).flat()
  const contracts = await getRelevantContracts(pg, allBets)
  const answersByContractId = await getAnswersForContractsDirect(
    pg,
    contracts.filter((c) => c.mechanism === 'cpmm-multi-1').map((c) => c.id)
  )

  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))

  for (const [contractId, answers] of Object.entries(answersByContractId)) {
    // Denormalize answers onto the contract.
    // eslint-disable-next-line no-extra-semi
    ;(contractsById[contractId] as CPMMMultiContract).answers = answers
  }

  log(`Loaded ${contracts.length} contracts.`)

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
    const unresolvedBetsOnly = userMetricRelevantBets.filter((b) =>
      b.answerId
        ? !answersByContractId[b.contractId].find((a) => a.id === b.answerId)
            ?.resolution
        : !contractsById[b.contractId].resolution
    )
    const newPortfolio = calculateNewPortfolioMetrics(
      user,
      contractsById,
      unresolvedBetsOnly
    )
    const didPortfolioChange =
      currPortfolio === undefined ||
      currPortfolio.balance !== newPortfolio.balance ||
      currPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
      currPortfolio.investmentValue !== newPortfolio.investmentValue ||
      currPortfolio.loanTotal !== newPortfolio.loanTotal

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

    const metricsByContract = calculateMetricsByContractAndAnswer(
      metricRelevantBetsByContract,
      contractsById,
      user,
      answersByContractId
    ).flat()

    await bulkUpdateContractMetrics(metricsByContract).catch((e) => {
      log('Error upserting contract metrics', e)
    })

    const nextLoanPayout = isUserEligibleForLoan(newPortfolio)
      ? getUserLoanUpdates(metricRelevantBetsByContract, contractsById).payout
      : undefined

    if (didPortfolioChange) {
      portfolioUpdates.push({
        user_id: user.id,
        ts: new Date(newPortfolio.timestamp).toISOString(),
        investment_value: newPortfolio.investmentValue,
        balance: newPortfolio.balance,
        total_deposits: newPortfolio.totalDeposits,
        loan_total: newPortfolio.loanTotal,
      })
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
    left join answers as a on cb.answer_id = a.id
    where
      cb.user_id in ($1:list)
      and (c.resolution_time is null or c.resolution_time > $2)
      and (a is null or a.data->'resolution' is null or millis_to_ts(coalesce(((a.data->'resolutionTime')::bigint),0)) > $2)
    order by cb.created_time`,
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
      `select distinct on (user_id) user_id, investment_value, balance, total_deposits, loan_total
      from user_portfolio_history
      where user_id in ($1:list)
      order by user_id, ts desc`,
      [userIds],
      (r) => [r.user_id as string, convertPortfolioHistory(r)]
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
