import { groupBy, uniq, uniqBy } from 'lodash'
import { Contract } from 'common/contract'
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
import { log } from 'shared/utils'
import { filterDefined } from 'common/util/array'

export async function updateContractMetricsForUsers(
  contract: Contract,
  allContractBets: Bet[]
) {
  const betsByUser = groupBy(allContractBets, 'userId')
  const metrics: ContractMetric[] = []

  for (const userId in betsByUser) {
    const userBets = betsByUser[userId]
    metrics.push(...calculateUserMetrics(contract, userBets, userId))
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
        loan: m.loan,
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

export const bulkUpdateUserMetricsWithNewBetsOnly = async (
  pgTrans: SupabaseDirectClient,
  newBets: MarginalBet[],
  contractMetrics: ContractMetric[],
  writeUpdates: boolean
) => {
  const marginalBets = newBets.filter((b) => b.amount !== 0 || b.shares !== 0)
  if (marginalBets.length === 0) {
    return contractMetrics
  }
  const userIds = uniq(marginalBets.map((b) => b.userId))
  const answerIds = uniq(filterDefined(marginalBets.map((b) => b.answerId)))
  const isMultiMarket = answerIds.length > 0
  const contractId = marginalBets[0].contractId

  // TODO: remove this bit if we never see the missing metrics log
  const missingMetricsBets = marginalBets.filter(
    (b) =>
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
