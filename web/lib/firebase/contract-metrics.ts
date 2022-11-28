import { ContractMetrics } from 'common/calculate-metrics'
import {
  query,
  limit,
  Query,
  collection,
  orderBy,
  where,
  collectionGroup,
  getDocs,
} from 'firebase/firestore'
import { db } from './init'
import { ContractMetric } from 'common/contract-metric'

export type BinaryContractMetricsByOutcome = Record<
  'YES' | 'NO',
  ContractMetric[]
>

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

// Only works for binary contracts for now
export async function getBinaryContractUserContractMetrics(
  contractId: string,
  count: number
) {
  const yesSnap = await getDocs(
    query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      where('hasYesShares', '==', true),
      orderBy('totalShares.YES', 'desc'),
      limit(count)
    )
  )
  const noSnap = await getDocs(
    query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      where('hasNoShares', '==', true),
      orderBy('totalShares.NO', 'desc'),
      limit(count)
    )
  )
  const outcomeToDetails = {
    YES: yesSnap.docs.map((doc) => doc.data() as ContractMetrics),
    NO: noSnap.docs.map((doc) => doc.data() as ContractMetrics),
  }

  return outcomeToDetails
}
