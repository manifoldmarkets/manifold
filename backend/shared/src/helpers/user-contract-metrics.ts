import { groupBy, uniq } from 'lodash'
import {
  Contract,
  DPM_CUTOFF_TIMESTAMP,
  PROFIT_CUTOFF_TIME,
} from 'common/contract'
import { Bet } from 'common/bet'
import {
  calculateUserMetrics,
  calculateUserMetricsWithNewBetsOnly,
  MarginalBet,
} from 'common/calculate-metrics'
import { bulkUpsert } from 'shared/supabase/utils'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { ContractMetric } from 'common/contract-metric'
import { Tables } from 'common/supabase/utils'
import { getUsers, log } from 'shared/utils'
import { getAnswersForContract } from 'shared/supabase/answers'
import { filterDefined } from 'common/util/array'
import { floatingEqual } from 'common/util/math'

export async function updateContractMetricsForUsers(
  pg: SupabaseDirectClient,
  contract: Contract,
  allContractBets: Bet[]
) {
  const betsByUser = groupBy(allContractBets, 'userId')
  const metrics: ContractMetric[] = []

  const users = await getUsers(Object.keys(betsByUser))
  const answers = await getAnswersForContract(pg, contract.id)

  for (const userId in betsByUser) {
    const userBets = betsByUser[userId]
    const user = users.find((u) => u.id === userId)
    if (!user) {
      log('User not found', userId)
    } else {
      metrics.push(...calculateUserMetrics(contract, userBets, user, answers))
    }
  }

  await bulkUpdateContractMetrics(metrics)
}

export async function bulkUpdateContractMetrics(
  metrics: Omit<ContractMetric, 'id'>[],
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) {
  return bulkUpsert(
    pg,
    'user_contract_metrics',
    [],
    metrics.map(
      (m) =>
        ({
          contract_id: m.contractId,
          user_id: m.userId,
          data: m,
          has_shares: m.hasShares,
          profit: m.profit,
          has_no_shares: m.hasNoShares,
          has_yes_shares: m.hasYesShares,
          total_shares_no: m.totalShares['NO'] ?? null,
          total_shares_yes: m.totalShares['YES'] ?? null,
          answer_id: m.answerId,
          profit_adjustment: m.profitAdjustment ?? null,
        } as Tables['user_contract_metrics']['Insert'])
    ),
    `CONFLICT (user_id, contract_id, coalesce(answer_id, ''))`
  )
}

export const setAdjustProfitFromResolvedMarkets = async (
  resolvedContractId: string
) => {
  const pg = createSupabaseDirectClient()
  const userIds = await pg.map(
    `
    select distinct user_id
    from user_contract_metrics
    where contract_id = $1
    `,
    [resolvedContractId],
    (row) => row.user_id
  )
  log(
    'Setting resolved_profit_adjustment for resolved bettors on market',
    resolvedContractId,
    'users:',
    userIds.length
  )
  await pg.none(
    `
  with resolved_metrics as (
      select ucm.profit_adjustment, ucm.user_id
      from user_contract_metrics ucm
       join contracts on contracts.id = ucm.contract_id
        -- don't get ucm's per answer id unless it's not fully resolved
       left join answers on answers.id = ucm.answer_id and answers.contract_id = contracts.id
      where ucm.user_id = any($1)
      -- ignore old dpm markets
      and (contracts.mechanism != 'cpmm-multi-1' or
           contracts.created_time >$2)
      and (
          -- get ucm's for resolved, non-multi markets
          (contracts.resolution_time is not null
          and ucm.answer_id is null
          and ucm.profit_adjustment is not null
          and contracts.mechanism!='cpmm-multi-1')
          or
          -- get ucm's for resolved multi market answers
          ( answers.resolution_time is not null
            and ucm.answer_id is not null
            and ucm.profit_adjustment is not null)
        )
  ),
  aggregated_metrics as (
    select user_id, sum(resolved_metrics.profit_adjustment) as resolved_profit_adjustment
    from resolved_metrics
    group by user_id
  )
  update users
  set resolved_profit_adjustment = aggregated_metrics.resolved_profit_adjustment
  from aggregated_metrics
  where users.id = aggregated_metrics.user_id
  and users.id = any($1)
    `,
    [userIds, DPM_CUTOFF_TIMESTAMP, PROFIT_CUTOFF_TIME]
  )
  log(
    'Updated resolved_profit_adjustment for bettors on market',
    resolvedContractId
  )
}

export const rerankContractMetrics = async (contractId: string) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `
        update user_contract_metrics
        set profit_adjustment = (
            case when (
                coalesce((contracts.data -> 'isRanked')::boolean, true) = false
                    or contracts.visibility != 'public') then -profit
                end
            )
        from contracts
        where user_contract_metrics.contract_id = contracts.id
          and contracts.id = $1
    `,
    [contractId]
  )
}

export const rerankContractMetricsManually = async (
  contractId: string,
  isRanked: boolean,
  resolutionTime: number | undefined
) => {
  const should10xProfit =
    (resolutionTime ?? PROFIT_CUTOFF_TIME + 1) <= PROFIT_CUTOFF_TIME && isRanked
  const pg = createSupabaseDirectClient()
  if (should10xProfit) {
    await pg.none(
      `
          update user_contract_metrics
          set profit_adjustment = case
              when $2::boolean = true then profit * 9
              else -profit * 9
              end
          where contract_id = $1
      `,
      [contractId, isRanked]
    )
  } else {
    await pg.none(
      `
          update user_contract_metrics
          set profit_adjustment = case
              when $2::boolean = true then null
              else -profit
              end
          where contract_id = $1
      `,
      [contractId, isRanked]
    )
  }
  if (resolutionTime !== undefined) {
    await setAdjustProfitFromResolvedMarkets(contractId)
  }
}

const getDefaultMetric = (
  userId: string,
  contractId: string,
  answerId: string | null
): Omit<ContractMetric, 'id'> => ({
  userId,
  contractId,
  answerId,
  loan: 0,
  invested: 0,
  totalShares: { NO: 0, YES: 0 },
  totalSpent: { NO: 0, YES: 0 },
  payout: 0,
  profit: 0,
  profitPercent: 0,
  profitAdjustment: undefined,
  hasNoShares: false,
  hasShares: false,
  hasYesShares: false,
  maxSharesOutcome: null,
  lastBetTime: 0,
  from: undefined,
  totalAmountInvested: 0,
  totalAmountSold: 0,
})

const defaultTimeScaleValues = {
  profit: 0,
  profitPercent: 0,
  invested: 0,
  prevValue: 0,
  value: 0,
}

export const bulkUpdateUserMetricsWithNewBetsOnly = async (
  pgTrans: SupabaseDirectClient,
  marginalBets: MarginalBet[]
) => {
  if (marginalBets.every((b) => b.shares === 0 && b.amount === 0)) {
    return
  }
  const userIds = uniq(marginalBets.map((b) => b.userId))
  const answerIds = uniq(filterDefined(marginalBets.map((b) => b.answerId)))
  const isMultiMarket = answerIds.length > 0
  const contractId = marginalBets[0].contractId
  const userMetrics = await pgTrans.map<ContractMetric>(
    `select data from user_contract_metrics
    where contract_id = $1 and user_id = any($2)
    and ($3 is null or answer_id = any($3) or answer_id is null)
    `,
    [contractId, userIds, isMultiMarket ? answerIds : null],
    (row) => row.data
  )
  const betsByUser = groupBy(marginalBets, 'userId')

  const updatedMetrics = Object.entries(betsByUser).flatMap(
    ([userId, bets]) => {
      // If it's a multi market, we need to summarize the stats for the null answer
      const oldSummary = userMetrics.find(
        (m) =>
          m.answerId === null &&
          m.userId === userId &&
          m.contractId === contractId
      )
      const userBetsByAnswer = groupBy(bets, 'answerId')
      const newMetrics = Object.entries(userBetsByAnswer).map(
        ([answerIdString, bets]) => {
          const answerId =
            answerIdString === 'undefined' ? null : answerIdString
          const oldMetric = userMetrics.find(
            (m) =>
              m.answerId === answerId &&
              m.userId === userId &&
              m.contractId === contractId
          )
          if (oldSummary && oldMetric && isMultiMarket) {
            // Subtract the old stats from the old summary metric
            applyMetricToSummary(oldMetric, oldSummary, false)
          }
          const userMetric =
            oldMetric ?? getDefaultMetric(userId, contractId, answerId)

          return calculateUserMetricsWithNewBetsOnly(bets, userMetric)
        }
      )
      if (!isMultiMarket) {
        return newMetrics
      }
      // Then add the new metric row stats to it
      const newSummary =
        oldSummary ?? getDefaultMetric(userId, contractId, null)
      newMetrics.forEach((m) => applyMetricToSummary(m, newSummary, true))
      return [...newMetrics, newSummary]
    }
  )
  await bulkUpdateContractMetrics(updatedMetrics, pgTrans)
}

// We could do this all in the database trigger, but the logic gets hairy
const applyMetricToSummary = (
  metric: Omit<ContractMetric, 'id'>,
  summary: Omit<ContractMetric, 'id'>,
  add: boolean
) => {
  const sign = add ? 1 : -1
  summary.totalShares['NO'] += sign * (metric.totalShares['NO'] ?? 0)
  summary.totalShares['YES'] += sign * (metric.totalShares['YES'] ?? 0)
  if (!summary.totalSpent) {
    summary.totalSpent = { NO: 0, YES: 0 }
  }
  if (metric.totalSpent) {
    summary.totalSpent['NO'] += sign * (metric.totalSpent['NO'] ?? 0)
    summary.totalSpent['YES'] += sign * (metric.totalSpent['YES'] ?? 0)
  }
  if (metric.profitAdjustment) {
    summary.profitAdjustment =
      (summary.profitAdjustment ?? 0) + sign * metric.profitAdjustment
  }
  summary.loan += sign * metric.loan
  summary.invested += sign * metric.invested
  summary.payout += sign * metric.payout
  summary.profit += sign * metric.profit
  summary.totalAmountInvested += sign * metric.totalAmountInvested
  summary.totalAmountSold += sign * metric.totalAmountSold
  summary.profitPercent = floatingEqual(summary.totalAmountInvested, 0)
    ? 0
    : (summary.profit / summary.totalAmountInvested) * 100

  summary.lastBetTime = Math.max(summary.lastBetTime, metric.lastBetTime)
  if (metric.from) {
    const timeScales = Object.keys(metric.from)
    summary.from = Object.fromEntries(
      timeScales.map((timeScale) => {
        const m = metric.from![timeScale]
        const s = summary.from?.[timeScale] ?? defaultTimeScaleValues
        const update = {
          profit: s.profit + sign * m.profit,
          invested: s.invested + sign * m.invested,
          prevValue: s.prevValue + sign * m.prevValue,
          value: s.value + sign * m.value,
        }
        const profitPercent =
          update.invested === 0 ? 0 : (update.profit / update.invested) * 100
        return [timeScale, { ...update, profitPercent }]
      })
    )
  }
  // These are set by the trigger:
  // summaryMetric.hasNoShares
  // summaryMetric.hasYesShares
  // summaryMetric.hasShares
  return summary
}
