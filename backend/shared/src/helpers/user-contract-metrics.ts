import { keyBy, uniq, uniqBy } from 'lodash'
import {
  calculateAnswerMetricsWithNewBetsOnly,
  MarginalBet,
} from 'common/calculate-metrics'
import { bulkUpsert, bulkUpsertQuery } from 'shared/supabase/utils'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { ContractMetric } from 'common/contract-metric'
import { Tables } from 'common/supabase/utils'
import { log } from 'shared/utils'
import { filterDefined } from 'common/util/array'

// Generates a unique key for deduplication matching the DB constraint
const getMetricKey = (m: Omit<ContractMetric, 'id'>) =>
  `${m.userId}-${m.contractId}-${m.answerId ?? ''}`

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
  // Deduplicate by (userId, contractId, answerId) to avoid
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" error.
  // Keep the last occurrence (most recent update) for each key.
  const deduped = Object.values(keyBy(metrics, getMetricKey))
  if (deduped.length < metrics.length) {
    log('Warning: bulkUpdateContractMetrics had duplicate metrics', {
      original: metrics.length,
      deduped: deduped.length,
      contractId: metrics[0]?.contractId,
    })
  }
  return bulkUpsert(
    pg,
    'user_contract_metrics',
    [],
    getColumnsFromMetrics(deduped),
    `CONFLICT (user_id, contract_id, coalesce(answer_id, ''))`
  )
}
export function bulkUpdateContractMetricsQuery(
  metrics: Omit<ContractMetric, 'id'>[]
) {
  if (metrics.length === 0) {
    return 'select 1 where false'
  }
  // Deduplicate by (userId, contractId, answerId) to avoid
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" error.
  // Keep the last occurrence (most recent update) for each key.
  const deduped = Object.values(keyBy(metrics, getMetricKey))
  if (deduped.length < metrics.length) {
    log('Warning: bulkUpdateContractMetricsQuery had duplicate metrics', {
      original: metrics.length,
      deduped: deduped.length,
      contractId: metrics[0]?.contractId,
    })
  }
  return bulkUpsertQuery(
    'user_contract_metrics',
    [],
    getColumnsFromMetrics(deduped),
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
    const missingAnswerIds = filterDefined(
      missingMetricsBets.map((b) => b.answerId)
    )
    // Check if any bets have null/undefined answerId (e.g. interest claim bets during resolution)
    const hasNullAnswerBets = missingMetricsBets.some((b) => b.answerId == null)
    const missingContractMetrics = await getContractMetrics(
      pgTrans,
      userIds,
      contractId,
      missingAnswerIds,
      hasNullAnswerBets
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
  // Build the answer_id condition:
  // - If answerIds is non-empty, include those specific answer_ids
  // - If includeNullAnswer is true, also include metrics with answer_id is null
  // - If both are empty/false, this would return nothing (intentional)
  const hasAnswerIds = answerIds.length > 0
  const answerConditions: string[] = []
  if (hasAnswerIds) {
    answerConditions.push('answer_id = any ($3)')
  }
  if (includeNullAnswer) {
    answerConditions.push('answer_id is null')
  }
  // If no conditions, we shouldn't fetch anything
  if (answerConditions.length === 0) {
    return []
  }
  const answerClause = `(${answerConditions.join(' or ')})`

  return await pg.map<ContractMetric>(
    `select data from user_contract_metrics
       where contract_id = $1
         and user_id = any ($2)
         and ${answerClause}
    `,
    [contractId, userIds, hasAnswerIds ? answerIds : null],
    (row) => row.data as ContractMetric
  )
}
export const getContractMetricsForContract = async (
  pg: SupabaseDirectClient,
  contractId: string,
  answerIds: string[] | null
) => {
  return await pg.map<ContractMetric>(
    `select data from user_contract_metrics
       where contract_id = $1
         and ($2 is null or answer_id = any ($2))
    `,
    [contractId, answerIds?.length ? answerIds : null],
    (row) => row.data as ContractMetric
  )
}
