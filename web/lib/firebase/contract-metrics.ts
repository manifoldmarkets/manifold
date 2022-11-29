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
  ) as Query<ContractMetric[]>
}
