import { ContractMetrics } from 'common/calculate-metrics'
import {
  query,
  limit,
  Query,
  collection,
  orderBy,
  where,
} from 'firebase/firestore'
import { db } from './init'
import { ContractMetric } from 'common/contract-metric'

export const CONTRACT_METRICS_SORTED_INDICES = ['YES', 'NO']

export type ContractMetricsByOutcome = Record<string, ContractMetric[]>

export function getUserContractMetricsQuery(
  userId: string,
  count: number,
  sort: 'asc' | 'desc'
) {
  return query(
    collection(db, 'users', userId, 'contract-metrics'),
    where('from.day.profit', sort === 'desc' ? '>' : '<', 0),
    orderBy('from.day.profit', sort),
    limit(count)
  ) as Query<ContractMetrics>
}
