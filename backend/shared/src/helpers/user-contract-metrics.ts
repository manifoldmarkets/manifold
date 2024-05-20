import { groupBy } from 'lodash'
import {
  Contract,
  DPM_CUTOFF_TIMESTAMP,
  PROFIT_CUTOFF_TIME,
} from 'common/contract'
import { Bet } from 'common/bet'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { bulkUpsert } from 'shared/supabase/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ContractMetric } from 'common/contract-metric'
import { Tables } from 'common/supabase/utils'
import { log } from 'shared/utils'

export async function updateContractMetricsForUsers(
  contract: Contract,
  allContractBets: Bet[]
) {
  const betsByUser = groupBy(allContractBets, 'userId')
  const metrics: ContractMetric[] = []
  for (const userId in betsByUser) {
    const userBets = betsByUser[userId]
    metrics.push(...calculateUserMetrics(contract, userBets))
  }

  await bulkUpdateContractMetrics(metrics)
}

export async function bulkUpdateContractMetrics(metrics: ContractMetric[]) {
  const pg = createSupabaseDirectClient()
  const updatedTime = new Date().toISOString()
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
          fs_updated_time: updatedTime,
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
    select user_id
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
          (answers.data->'resolutionTime' is not null
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
  isResolved: boolean
) => {
  const pg = createSupabaseDirectClient()
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
  if (isResolved) {
    await setAdjustProfitFromResolvedMarkets(contractId)
  }
}
