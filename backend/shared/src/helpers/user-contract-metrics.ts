import { groupBy, uniq, uniqBy } from 'lodash'
import {
  Contract,
  DPM_CUTOFF_TIMESTAMP,
  PROFIT_CUTOFF_TIME,
} from 'common/contract'
import { Bet } from 'common/bet'
import {
  calculateAnswerMetricsWithNewBetsOnly,
  calculateUserMetrics,
  MarginalBet,
} from 'common/calculate-metrics'
import { bulkUpsert, bulkUpsertQuery } from 'shared/supabase/utils'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { ContractMetric } from 'common/contract-metric'
import { Tables } from 'common/supabase/utils'
import { getUsers, log } from 'shared/utils'
import { getAnswersForContract } from 'shared/supabase/answers'
import { filterDefined } from 'common/util/array'

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

const getColumnsFromMetrics = (metrics: Omit<ContractMetric, 'id'>[]) =>
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
  )

export async function bulkUpdateContractMetrics(
  metrics: Omit<ContractMetric, 'id'>[],
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) {
  return bulkUpsert(
    pg,
    'user_contract_metrics',
    [],
    getColumnsFromMetrics(metrics),
    `CONFLICT (user_id, contract_id, coalesce(answer_id, ''))`
  )
}
export function bulkUpdateContractMetricsQuery(
  metrics: Omit<ContractMetric, 'id'>[]
) {
  return bulkUpsertQuery(
    'user_contract_metrics',
    [],
    getColumnsFromMetrics(metrics),
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

export const bulkUpdateUserMetricsWithNewBetsOnly = async (
  pgTrans: SupabaseDirectClient,
  marginalBets: MarginalBet[],
  contractMetrics: ContractMetric[],
  writeUpdates: boolean
) => {
  if (marginalBets.every((b) => b.shares === 0 && b.amount === 0)) {
    return contractMetrics
  }
  const userIds = uniq(marginalBets.map((b) => b.userId))
  const answerIds = uniq(filterDefined(marginalBets.map((b) => b.answerId)))
  const isMultiMarket = answerIds.length > 0
  const contractId = marginalBets[0].contractId

  // TODO: remove this bit if we never see the missing metrics log
  const missingMetricsBets = marginalBets.filter(
    (b) =>
      b.amount !== 0 &&
      b.shares !== 0 &&
      !contractMetrics.some(
        (m) =>
          m.userId === b.userId &&
          m.contractId === b.contractId &&
          m.answerId == b.answerId
      )
  )
  if (missingMetricsBets.length > 0) {
    const missingContractMetrics = await getContractMetrics(
      pgTrans,
      userIds,
      contractId,
      filterDefined(missingMetricsBets.map((b) => b.answerId)),
      false
    )
    if (missingContractMetrics.length > 0) {
      log('Found missing metrics:', {
        contractId,
        userIds,
        answerIds,
        missingMetricsBets,
        missingContractMetrics,
      })
      contractMetrics.push(...missingContractMetrics)
    }
  }

  const updatedMetrics = calculateAnswerMetricsWithNewBetsOnly(
    marginalBets,
    contractMetrics,
    contractId,
    isMultiMarket
  )
  if (writeUpdates) {
    await bulkUpdateContractMetrics(updatedMetrics, pgTrans)
  }
  return uniqBy(
    [...(updatedMetrics ?? []), ...contractMetrics],
    (m) => m.userId + m.answerId + m.contractId
  ) as ContractMetric[]
}

export const getContractMetrics = async (
  pg: SupabaseDirectClient,
  userIds: string[],
  contractId: string,
  answerIds: string[],
  includeNullAnswer: boolean
) => {
  const metrics = await pg.map<ContractMetric>(
    `select data from user_contract_metrics
       where contract_id = $1
         and user_id = any ($2)
         and ($3 is null or answer_id = any ($3) ${
           includeNullAnswer ? 'or answer_id is null' : ''
         })
    `,
    [contractId, userIds, answerIds.length > 0 ? answerIds : null],
    (row) => row.data as ContractMetric
  )
  return metrics
}
