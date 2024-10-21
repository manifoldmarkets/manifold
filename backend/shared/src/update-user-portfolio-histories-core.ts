import { DAY_MS, HOUR_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import {
  contractColumnsToSelect,
  getUsers,
  isProd,
  log,
  revalidateStaticProps,
} from 'shared/utils'
import { groupBy, sum, sumBy, uniq } from 'lodash'
import {
  Contract,
  ContractToken,
  CPMMMultiContract,
  MarketContract,
} from 'common/contract'
import { calculateProfitMetricsWithProb } from 'common/calculate-metrics'
import { buildArray, filterDefined } from 'common/util/array'

import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { ContractMetric } from 'common/contract-metric'
import { Row } from 'common/supabase/utils'
import { BOT_USERNAMES } from 'common/envs/constants'
import { bulkInsert } from 'shared/supabase/utils'
import { type User } from 'common/user'
import { convertAnswer, convertContract } from 'common/supabase/contracts'

const userToPortfolioMetrics: {
  [userId: string]: {
    currentPortfolio: PortfolioMetrics | undefined
    dayAgoProfit: number | undefined
    weekAgoProfit: number | undefined
    timeCachedPeriodProfits: number
  }
} = {}
const LIMIT = isProd() ? 400 : 10
export async function updateUserPortfolioHistoriesCore(userIds?: string[]) {
  const now = Date.now()
  const yesterday = now - DAY_MS
  const weekAgo = now - DAY_MS * 7
  const pg = createSupabaseDirectClient()

  log('Loading active users...')
  const random = Math.random()
  const activeUserIds = userIds?.length
    ? userIds
    : await pg.map(
        `
      select distinct users.id, uph.last_calculated
      from users
        left join user_portfolio_history_latest uph on uph.user_id = users.id
      where (
       users.id not in (select distinct user_id from user_events
                where ts > now() - interval '10 minutes' and user_id is not null)
       and
       (users.id in (
           select distinct user_id from user_contract_interactions
           where created_time > now() - interval '6 weeks'
       ) or
       users.id in (
           select id from users where username in ($2:list) and
           (users.data -> 'lastBetTime')::bigint > ts_to_millis(now() - interval '6 weeks')
        ) or
       ($1 < 0.05 and id in (
           select distinct users.id from users
            join user_contract_metrics on users.id = user_contract_metrics.user_id
            join contracts on user_contract_metrics.contract_id = contracts.id
             where contracts.resolution_time is null
             and user_contract_metrics.has_shares = true
      ))
    ))
        order by uph.last_calculated nulls first limit $3`,
        [random, BOT_USERNAMES, LIMIT],
        (r) => r.id as string
      )

  log(`Loaded ${activeUserIds.length} active users.`)

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
    const [dayAgoProfits, weekAgoProfits] = await Promise.all(
      [yesterday, weekAgo].map((t) =>
        getPortfolioHistoricalProfits(pg, userIdsNeedingUpdate, t)
      )
    )
    log(`Loaded historical profits.`)
    for (const userId of userIdsNeedingUpdate) {
      userToPortfolioMetrics[userId] = {
        currentPortfolio:
          currentPortfolios[userId] ??
          userToPortfolioMetrics[userId]?.currentPortfolio,
        dayAgoProfit: dayAgoProfits[userId]?.mana,
        weekAgoProfit: weekAgoProfits[userId]?.mana,
        // TODO: cash profits
        timeCachedPeriodProfits: Date.now(),
      }
    }
  }

  log('Loading metrics, contracts, and answers...')
  const { metrics, contracts, answers } =
    await getUnresolvedContractMetricsContractsAnswers(pg, activeUserIds)
  log(`Loaded ${metrics.length} metrics.`)
  log(`Loaded ${contracts.length} contracts and their answers.`)

  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))
  const answersByContractId = groupBy(answers, (a) => a.contractId)
  for (const [contractId, answers] of Object.entries(answersByContractId)) {
    // Denormalize answers onto the contract.
    // eslint-disable-next-line no-extra-semi
    ;(contractsById[contractId] as CPMMMultiContract).answers = answers
  }

  const currentMetricsByUserId = groupBy(metrics, (m) => m.userId)

  const portfolioUpdates = [] as Omit<Row<'user_portfolio_history'>, 'id'>[]

  log('Loading user balances & deposit information...')
  // Load user data right before calculating metrics to avoid out-of-date deposit/balance data (esp. for new users that
  // get their first 9 deposits upon visiting new markets).
  const users = await getUsers(activeUserIds)
  log('Computing portfolio updates...')
  for (const user of users) {
    const userMetrics = currentMetricsByUserId[user.id] ?? []
    const { currentPortfolio } = userToPortfolioMetrics[user.id]
    const { balance, totalDeposits, resolvedProfitAdjustment } = user
    const newPortfolio = {
      ...calculateNewPortfolioMetricsWithContractMetrics(
        user,
        contractsById,
        userMetrics
      ),
      profit:
        (resolvedProfitAdjustment ?? 0) +
        // Resolved profits are already included in the user's balance - deposits
        sumBy(userMetrics, (m) => (m.profitAdjustment ?? 0) + m.profit) +
        balance -
        totalDeposits,
    }

    const didPortfolioChange =
      currentPortfolio === undefined ||
      currentPortfolio.balance !== newPortfolio.balance ||
      currentPortfolio.cashBalance !== newPortfolio.cashBalance ||
      currentPortfolio.spiceBalance !== newPortfolio.spiceBalance ||
      currentPortfolio.totalDeposits !== newPortfolio.totalDeposits ||
      currentPortfolio.totalCashDeposits !== newPortfolio.totalCashDeposits ||
      currentPortfolio.investmentValue !== newPortfolio.investmentValue ||
      currentPortfolio.cashInvestmentValue !==
        newPortfolio.cashInvestmentValue ||
      currentPortfolio.loanTotal !== newPortfolio.loanTotal ||
      currentPortfolio.profit !== newPortfolio.profit

    if (didPortfolioChange) {
      portfolioUpdates.push({
        user_id: user.id,
        ts: new Date(newPortfolio.timestamp).toISOString(),
        investment_value: newPortfolio.investmentValue,
        cash_investment_value: newPortfolio.cashInvestmentValue,
        balance: newPortfolio.balance,
        spice_balance: newPortfolio.spiceBalance,
        cash_balance: newPortfolio.cashBalance,
        total_deposits: newPortfolio.totalDeposits,
        total_cash_deposits: newPortfolio.totalCashDeposits,
        loan_total: newPortfolio.loanTotal,
        profit: newPortfolio.profit,
      })
      userToPortfolioMetrics[user.id].currentPortfolio = newPortfolio
    }
  }

  const userIdsNotWritten = activeUserIds.filter(
    (id) => !portfolioUpdates.some((p) => p.user_id === id)
  )
  log('Writing updates and inserts...')
  await Promise.all(
    buildArray(
      portfolioUpdates.length > 0 &&
        bulkInsert(pg, 'user_portfolio_history', portfolioUpdates)
          .catch((e) => log.error('Error inserting user portfolio history', e))
          .then(() =>
            log('Finished creating Supabase portfolio history entries...')
          ),
      userIdsNotWritten.length > 0 &&
        pg.query(
          `update user_portfolio_history_latest set last_calculated = $1 where user_id in ($2:list)`,
          [new Date(now).toISOString(), userIdsNotWritten]
        )
    )
  )

  await revalidateStaticProps('/leaderboards')

  log('Done.')
}

export const getUnresolvedContractMetricsContractsAnswers = async (
  pg: SupabaseDirectClient,
  userIds: string[]
) => {
  const metrics = await pg.map(
    `
    select ucm.data from user_contract_metrics ucm
    join contracts as c on ucm.contract_id = c.id
    left join answers as a on ucm.answer_id = a.id
    where
      ucm.user_id in ($1:list)
      and c.resolution_time is null
      and (a is null or a.resolution_time is null);
    `,
    [userIds],
    (r) => r.data as ContractMetric
  )
  if (metrics.length === 0) {
    return {
      metrics: [],
      contracts: [],
      answers: [],
    }
  }
  const contractIds = uniq(metrics.map((m) => m.contractId))
  const answerIds = filterDefined(uniq(metrics.map((m) => m.answerId)))
  const selectContracts = `select ${contractColumnsToSelect} from contracts where id in ($1:list);`
  if (answerIds.length === 0) {
    const contracts = await pg.map(
      selectContracts,
      [contractIds],
      convertContract
    )
    return {
      metrics,
      contracts,
      answers: [],
    }
  }
  const results = await pg.multi(
    `
    ${selectContracts}
    select * from answers where id in ($2:list);
    `,
    [contractIds, answerIds]
  )
  const contracts = results[0].map(convertContract)
  const answers = results[1].map(convertAnswer)
  return {
    metrics,
    contracts,
    answers,
  }
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
      `select *
      from user_portfolio_history_latest
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
  // We don't load the leaderboard profit here bc these numbers are used for comparing to the daily/weekly profit from contract metrics
  return Object.fromEntries(
    await pg.map(
      `select distinct on (user_id) user_id,
        spice_balance + investment_value + balance - total_deposits as profit,
        cash_balance - total_cash_deposits as cash_profit
      from user_portfolio_history
      where ts < $2 and user_id in ($1:list)
      order by user_id, ts desc`,
      [userIds, new Date(when).toISOString()],
      (r) => [
        r.user_id as string,
        {
          mana: parseFloat(r.profit as string),
          cash: parseFloat(r.cash_profit as string),
        },
      ]
    )
  )
}

export const calculateNewPortfolioMetricsWithContractMetrics = (
  user: User,
  contractsById: { [k: string]: Contract },
  contractMetrics: ContractMetric[]
) => {
  const getPayouts = (token: ContractToken) =>
    contractMetrics.map((cm) => {
      const contract = contractsById[cm.contractId] as MarketContract
      if (contract.token !== token || contract.isResolved) return 0
      // ignore summary metrics
      if (contract.mechanism === 'cpmm-multi-1') {
        if (!cm.answerId) return 0
        const answer = contract.answers.find((a) => a.id === cm.answerId)
        // Might not get an answer if it's not denormalized and resolved already, (excluded by the sql query)
        if (!answer || answer.resolutionTime) return 0
        return (
          calculateProfitMetricsWithProb(answer.prob, cm).payout -
          (cm.loan ?? 0)
        )
      }
      return (
        calculateProfitMetricsWithProb(contract.prob, cm).payout -
        (cm.loan ?? 0)
      )
    })
  const cashPayouts = sum(getPayouts('CASH'))
  const manaPayouts = sum(getPayouts('MANA'))
  const loanTotal = sumBy(contractMetrics, (cm) => cm.loan)
  return {
    investmentValue: manaPayouts,
    cashInvestmentValue: cashPayouts,
    balance: user.balance,
    cashBalance: user.cashBalance,
    spiceBalance: user.spiceBalance,
    totalDeposits: user.totalDeposits,
    totalCashDeposits: user.totalCashDeposits,
    loanTotal,
    timestamp: Date.now(),
    userId: user.id,
  }
}
