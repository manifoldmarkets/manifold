import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import {
  getUsers,
  isProd,
  log,
  prefixedContractColumnsToSelect,
} from 'shared/utils'
import { Dictionary, groupBy, sortBy, sumBy } from 'lodash'
import {
  Contract,
  ContractToken,
  CPMMMultiContract,
  MarketContract,
} from 'common/contract'
import {
  calculateProfitMetricsAtProbOrCancel,
  calculateUpdatedMetricsForContracts,
} from 'common/calculate-metrics'
import { buildArray } from 'common/util/array'

import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { ContractMetric } from 'common/contract-metric'
import { Row } from 'common/supabase/utils'
import { BOT_USERNAMES } from 'common/envs/constants'
import { bulkInsert } from 'shared/supabase/utils'
import { type User } from 'common/user'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { Answer } from 'common/answer'
import {
  renderSql,
  select,
  from,
  join,
  leftJoin,
  where,
} from './supabase/sql-builder'

const userToPortfolioMetrics: {
  [userId: string]: {
    currentPortfolio: PortfolioMetrics | undefined
  }
} = {}
type RankedContractMetric = ContractMetric & { isRanked: boolean }

export async function updateUserPortfolioHistoriesCore(userIds?: string[]) {
  const LIMIT = isProd() ? 400 : 10

  const now = Date.now()
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
      users.id in (
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
    )
        order by uph.last_calculated nulls first limit $3`,
        [random, BOT_USERNAMES, LIMIT],
        (r) => r.id as string
      )

  log(`Loaded ${activeUserIds.length} active users.`)

  const userIdsNeedingUpdate = activeUserIds.filter(
    (id) => !userToPortfolioMetrics[id]?.currentPortfolio
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
    for (const userId of userIdsNeedingUpdate) {
      userToPortfolioMetrics[userId] = {
        currentPortfolio:
          currentPortfolios[userId] ??
          userToPortfolioMetrics[userId]?.currentPortfolio,
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
    // eslint-disable-next-line no-extra-semi
    ;(contractsById[contractId] as CPMMMultiContract).answers = sortBy(
      answers,
      (a) => a.index
    )
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
    const { balance, totalDeposits } = user
    const { value: rankedManaPayouts } = getUnresolvedStatsForToken(
      'MANA',
      userMetrics.filter((m) => m.isRanked),
      contractsById
    )
    const { invested: unrankedManaInvested, loan: unrankedManaLoan } =
      getUnresolvedStatsForToken(
        'MANA',
        userMetrics.filter((m) => !m.isRanked),
        contractsById
      )
    const newPortfolio = {
      ...calculateNewPortfolioMetricsWithContractMetrics(
        user,
        contractsById,
        userMetrics
      ),
      // TODO: we still have to subtract resolved unranked (profit-invested) from balance
      profit:
        rankedManaPayouts +
        balance +
        // unranked mana invested is equivalent to balance
        unrankedManaInvested -
        unrankedManaLoan -
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

  // await revalidateStaticProps('/leaderboards')

  log('Done.')
}

export const getUnresolvedContractMetricsContractsAnswers = async (
  pg: SupabaseDirectClient,
  userIds: string[]
): Promise<{
  metrics: RankedContractMetric[]
  contracts: MarketContract[]
  answers: Answer[]
  updatedMetricsByContract: Dictionary<Omit<ContractMetric, 'id'>[]>
}> => {
  const sharedClauses = [
    where('ucm.user_id in ($1:list)'),
    where('c.resolution_time is null'),
    where('(a is null or a.resolution_time is null)'),
    where(
      `case when c.mechanism = 'cpmm-multi-1' then ucm.answer_id is not null else true end`
    ),
  ]
  const metricsSql = renderSql(
    select(
      `ucm.data, ucm.loan, ucm.margin_loan, coalesce((c.data->'isRanked')::boolean, true) as is_ranked`
    ),
    from('user_contract_metrics ucm'),
    join('contracts as c on ucm.contract_id = c.id'),
    leftJoin('answers as a on ucm.answer_id = a.id'),
    ...sharedClauses
  )
  const contractsSql = renderSql(
    select(`distinct on (c.id) ${prefixedContractColumnsToSelect}`),
    from('contracts as c'),
    join('user_contract_metrics ucm on ucm.contract_id = c.id'),
    leftJoin('answers as a on ucm.answer_id = a.id'),
    ...sharedClauses
  )
  const answersSql = renderSql(
    select('distinct on (a.id) a.*'),
    from('answers as a'),
    join('user_contract_metrics ucm on ucm.answer_id = a.id'),
    join('contracts as c on ucm.contract_id = c.id'),
    ...sharedClauses
  )

  const results = await pg.multi(
    `
    ${metricsSql};
    ${contractsSql};
    ${answersSql};
    `,
    [userIds]
  )
  const metrics = results[0].map(
    (r) =>
      ({
        ...r.data,
        loan: r.loan ?? r.data.loan ?? 0,
        marginLoan: r.margin_loan ?? r.data.marginLoan ?? 0,
        isRanked: r.is_ranked,
      } as RankedContractMetric)
  )
  const contracts = results[1].map<MarketContract>(convertContract)
  const answers = results[2].map(convertAnswer)
  if (metrics.length === 0) {
    return {
      metrics: [],
      contracts: [],
      answers: [],
      updatedMetricsByContract: {},
    }
  }
  const contractsWithMetrics = contracts.map((c) => ({
    contract: c,
    metrics: metrics.filter((m) => m.contractId === c.id),
  }))
  const { metricsByContract } =
    calculateUpdatedMetricsForContracts(contractsWithMetrics)

  return {
    metrics,
    contracts,
    answers,
    updatedMetricsByContract: metricsByContract,
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

export const getUnresolvedStatsForToken = (
  token: ContractToken,
  contractMetrics: ContractMetric[],
  contractsById: { [k: string]: Contract }
) => {
  const metrics = contractMetrics.map((cm) => {
    const contract = contractsById[cm.contractId] as MarketContract
    if (contract.token !== token) {
      return { value: 0, invested: 0, dailyProfit: 0, loan: 0 }
    }
    if (contract.isResolved) {
      return {
        value: 0,
        invested: 0,
        dailyProfit: cm.from?.day?.profit ?? 0,
        loan: 0,
      }
    }

    // ignore summary metrics
    if (contract.mechanism === 'cpmm-multi-1') {
      if (!cm.answerId)
        return { value: 0, invested: 0, dailyProfit: 0, loan: 0 }
      const answer = contract.answers.find((a) => a.id === cm.answerId)
      // Might not get an answer if it's not denormalized and resolved already, (excluded by the sql query)
      if (!answer || answer.resolutionTime)
        return {
          value: 0,
          invested: 0,
          dailyProfit: cm.from?.day?.profit ?? 0,
          loan: 0,
        }
      // Include both free loans and margin loans
      const totalLoan = (cm.loan ?? 0) + (cm.marginLoan ?? 0)
      return {
        value:
          calculateProfitMetricsAtProbOrCancel(answer.prob, cm).payout -
          totalLoan,
        invested: cm.invested ?? 0,
        dailyProfit: cm.from?.day?.profit ?? 0,
        loan: totalLoan,
      }
    }

    // Include both free loans and margin loans
    const totalLoan = (cm.loan ?? 0) + (cm.marginLoan ?? 0)
    return {
      value:
        calculateProfitMetricsAtProbOrCancel(contract.prob, cm).payout -
        totalLoan,
      invested: cm.invested ?? 0,
      dailyProfit: cm.from?.day?.profit ?? 0,
      loan: totalLoan,
    }
  })

  return {
    value: sumBy(metrics, (m) => m.value),
    invested: sumBy(metrics, (m) => m.invested),
    dailyProfit: sumBy(metrics, (m) => m.dailyProfit),
    loan: sumBy(metrics, (m) => m.loan),
  }
}

export const calculateNewPortfolioMetricsWithContractMetrics = (
  user: User,
  contractsById: { [k: string]: Contract },
  contractMetrics: ContractMetric[]
) => {
  const cashPayouts = getUnresolvedStatsForToken(
    'CASH',
    contractMetrics,
    contractsById
  ).value
  const manaPayouts = getUnresolvedStatsForToken(
    'MANA',
    contractMetrics,
    contractsById
  ).value
  // Sum both free loans (loan) and margin loans (marginLoan)
  const loanTotal = sumBy(contractMetrics, (cm) => (cm.loan ?? 0) + (cm.marginLoan ?? 0))
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
