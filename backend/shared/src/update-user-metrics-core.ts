import { DAY_MS, HOUR_MS } from 'common/util/time'
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
import { buildArray, filterDefined } from 'common/util/array'
import { hasChanges } from 'common/util/object'
import { bulkInsert } from 'shared/supabase/utils'
import { Bet } from 'common/bet'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import * as admin from 'firebase-admin'
import { log } from 'shared/utils'
import { getAnswersForContractsDirect } from 'shared/supabase/answers'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'
import { convertBet } from 'common/supabase/bets'
import { ContractMetric } from 'common/contract-metric'

const userToPortfolioMetrics: {
  [userId: string]: {
    currentPortfolio: Omit<PortfolioMetrics, 'userId'> | undefined
    dayAgoProfit: number
    weekAgoProfit: number
    monthAgoProfit: number
    timeCachedPeriodProfits: number
  }
} = {}

export async function updateUserMetricsCore() {
  const firestore = admin.firestore()
  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - DAY_MS * 7
  const monthAgo = now - DAY_MS * 30
  const pg = createSupabaseDirectClient()
  const writer = new SafeBulkWriter(undefined, firestore)

  log('Loading active users...')
  const random = Math.random()
  const activeUserIds = await pg.map(
    `select distinct users.id, users.data->'metricsLastUpdated' as last_updated
     from users where (
       users.id in (
           select distinct user_id from user_contract_interactions
           where created_time > now() - interval '1 month'
       )
         or ($1 < 0.005 and users.data->'lastBetTime' is not null)
       )
     order by last_updated nulls first limit 500`,
    [random],
    (r) => r.id as string
  )

  for (const userId of activeUserIds) {
    const doc = firestore.collection('users').doc(userId)
    writer.update(doc, { metricsLastUpdated: now })
  }
  log(`Loaded ${activeUserIds.length} active users.`)

  log('Loading creator trader counts...')
  const [yesterdayTraders, weeklyTraders, monthlyTraders, allTimeTraders] =
    await Promise.all(
      [yesterday, weekAgo, monthAgo, undefined].map((t) =>
        getCreatorTraders(pg, activeUserIds, t)
      )
    )
  log(`Loaded creator trader counts.`)

  const userIdsNeedingUpdate = activeUserIds.filter(
    (id) =>
      !userToPortfolioMetrics[id]?.currentPortfolio ||
      (userToPortfolioMetrics[id]?.timeCachedPeriodProfits ?? 0) <
        now - 6 * HOUR_MS
  )

  if (userIdsNeedingUpdate.length > 0) {
    log(
      `Fetching portfolio metrics for ${
        userIdsNeedingUpdate.length
      } users. Already have metrics for ${
        Object.keys(userToPortfolioMetrics).length
      } users.`
    )
    const userIdsMissingPortfolio = activeUserIds.filter(
      (id) => !userToPortfolioMetrics[id]?.currentPortfolio
    )
    log(
      `Loading current portfolio snapshot for ${userIdsMissingPortfolio.length} users...`
    )
    // We recalculate the portfolio every run per user, so we don't need to ever query it more than once
    const currentPortfolios = await getPortfolioSnapshot(
      pg,
      userIdsMissingPortfolio
    )
    log(`Loaded current portfolio snapshot.`)

    log('Loading historical profits...')
    const [dayAgoProfits, weekAgoProfits, monthAgoProfits] = await Promise.all(
      [yesterday, weekAgo, monthAgo].map((t) =>
        getPortfolioHistoricalProfits(pg, userIdsNeedingUpdate, t)
      )
    )
    log(`Loaded historical profits.`)
    for (const userId of userIdsNeedingUpdate) {
      userToPortfolioMetrics[userId] = {
        currentPortfolio:
          currentPortfolios[userId] ??
          userToPortfolioMetrics[userId]?.currentPortfolio,
        dayAgoProfit: dayAgoProfits[userId],
        weekAgoProfit: weekAgoProfits[userId],
        monthAgoProfit: monthAgoProfits[userId],
        timeCachedPeriodProfits: Date.now(),
      }
    }
  }

  log('Loading bets...')

  // We need to update metrics for contracts that resolved up through a month ago,
  // for the purposes of computing the daily/weekly/monthly profit on them
  const metricRelevantBets = await getMetricRelevantUserBets(
    pg,
    activeUserIds,
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
  log('Loading answers...')
  const answersByContractId = await getAnswersForContractsDirect(
    pg,
    contracts.filter((c) => c.mechanism === 'cpmm-multi-1').map((c) => c.id)
  )
  log(`Loaded ${contracts.length} contracts and their answers.`)

  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))

  for (const [contractId, answers] of Object.entries(answersByContractId)) {
    // Denormalize answers onto the contract.
    // eslint-disable-next-line no-extra-semi
    ;(contractsById[contractId] as CPMMMultiContract).answers = answers
  }

  log('Loading current contract metrics...')
  const currentContractMetrics = await pg.map(
    `select data from user_contract_metrics
            where user_id in ($1:list)
            and contract_id in ($2:list)
            `,
    [activeUserIds, contracts.map((c) => c.id)],
    (r) => r.data as ContractMetric
  )
  log(`Loaded ${currentContractMetrics.length} current contract metrics.`)

  const contractMetricsByUserId = groupBy(
    currentContractMetrics,
    (m) => m.userId
  )

  const userUpdates = []
  const portfolioUpdates = []
  const contractMetricUpdates = []

  log('Loading user balances & deposit information...')
  // Load user data right before calculating metrics to avoid out-of-date deposit/balance data (esp. for new users that
  // get their first 9 deposits upon visiting new markets).
  const users = await pg.map(
    `select data from users
            where id in ($1:list)`,
    [activeUserIds],
    (r) => r.data as User
  )
  log('Computing metric updates...')
  for (const user of users) {
    const userMetricRelevantBets = metricRelevantBets[user.id] ?? []
    const { currentPortfolio } = userToPortfolioMetrics[user.id]
    const creatorTraders = {
      daily: yesterdayTraders[user.id] ?? 0,
      weekly: weeklyTraders[user.id] ?? 0,
      monthly: monthlyTraders[user.id] ?? 0,
      allTime: allTimeTraders[user.id] ?? 0,
    }
    const unresolvedBetsOnly = userMetricRelevantBets.filter((b) => {
      if (contractsById[b.contractId].isResolved) return false
      const answers = answersByContractId[b.contractId]
      if (b.answerId === 'undefined' || !b.answerId) {
        return !contractsById[b.contractId].resolution
      } else if (b.answerId && answers) {
        const answer = answers.find((a) => a.id === b.answerId)
        if (!answer) {
          log(
            `Answer not found for contract ${b.contractId}, answer ${b.answerId}, bet ${b.id}`
          )
          // We're assuming if there's no answer found, it's not resolved
          return true
        }
        return !answer.resolution
      } else if (b.answerId && !answers) {
        log(
          `No answers found for contract ${b.contractId}, answer ${b.answerId}, bet ${b.id}`
        )
      }
      return !contractsById[b.contractId].resolution
    })
    const newPortfolio = calculateNewPortfolioMetrics(
      user,
      contractsById,
      unresolvedBetsOnly
    )
    const didPortfolioChange =
      currentPortfolio === undefined ||
      currentPortfolio.balance !== newPortfolio.balance ||
      currentPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
      currentPortfolio.investmentValue !== newPortfolio.investmentValue ||
      currentPortfolio.loanTotal !== newPortfolio.loanTotal

    const allTimeProfit =
      newPortfolio.balance +
      newPortfolio.investmentValue -
      newPortfolio.totalDeposits
    const newProfit = {
      daily:
        allTimeProfit -
        (userToPortfolioMetrics[user.id].dayAgoProfit ?? allTimeProfit),
      weekly:
        allTimeProfit -
        (userToPortfolioMetrics[user.id].weekAgoProfit ?? allTimeProfit),
      monthly:
        allTimeProfit -
        (userToPortfolioMetrics[user.id].monthAgoProfit ?? allTimeProfit),
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
    const currentMetricsForUser = contractMetricsByUserId[user.id] ?? []
    contractMetricUpdates.push(
      ...metricsByContract.filter(
        (cm) =>
          // Their contract metrics are updated upon selling out of a contract
          cm.hasShares &&
          hasChanges(
            cm,
            currentMetricsForUser.find(
              (m) =>
                m.contractId === cm.contractId && cm.answerId === m.answerId
            ) ?? {}
          )
      )
    )

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
      userToPortfolioMetrics[user.id].currentPortfolio = newPortfolio
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
  log(`Computed ${contractMetricUpdates.length} metric updates.`)

  log('Writing user updates...')
  for (const { user, fields } of filterDefined(userUpdates)) {
    if (hasChanges(user, fields)) {
      writer.update(firestore.collection('users').doc(user.id), fields)
    }
  }
  log('Finished user updates.')

  log('Writing updates and inserts...')
  await Promise.all(
    buildArray(
      contractMetricUpdates.length > 0 &&
        bulkUpdateContractMetrics(contractMetricUpdates)
          .catch((e) => log.error('Error upserting contract metrics', e))
          .then(() => log('Finished updating contract metrics.')),
      portfolioUpdates.length > 0 &&
        bulkInsert(pg, 'user_portfolio_history', portfolioUpdates)
          .catch((e) => log.error('Error inserting user portfolio history', e))
          .then(() =>
            log('Finished creating Supabase portfolio history entries...')
          ),
      writer
        .close()
        .catch((e) => log.error('Error bulk writing user updates', e))
        .then(() => log('Committed Firestore writes.'))
    )
  )

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
    (rows) => rows.map(convertBet)
  )
}

const getPortfolioSnapshot = async (
  pg: SupabaseDirectClient,
  userIds: string[]
) => {
  if (userIds.length === 0) {
    return {}
  }
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
