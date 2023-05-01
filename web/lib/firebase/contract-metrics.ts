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
  getCountFromServer,
} from 'firebase/firestore'
import { db } from './init'

export const CONTRACT_METRICS_SORTED_INDICES = ['YES', 'NO']

export async function getUserContractMetrics(userId: string) {
  const q = query(
    collection(db, 'users', userId, 'contract-metrics'),
    orderBy('lastBetTime', 'desc')
  ) as Query<ContractMetrics>
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => d.data())
}

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

// If you want shares sorted in descending order you have to make a new index for that outcome.
// You can still get all users with contract-metrics and shares without the index and sort them afterwards
// See use-contract-metrics.ts to extend this for more outcomes
export async function getCPMMContractUserContractMetrics(
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

export async function getTopContractMetrics(contractId: string, count: number) {
  const snap = await getDocs(
    query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      orderBy('profit', 'desc'),
      limit(count)
    )
  )
  const cms = snap.docs.map((doc) => doc.data() as ContractMetrics)

  return cms
}

export async function getProfitRankForContract(
  profit: number,
  contractId: string
) {
  const resp = await getCountFromServer(
    query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      where('profit', '>', profit)
    )
  )
  return resp.data().count + 1
}

export async function getTotalContractMetricsCount(contractId: string) {
  const resp = await getCountFromServer(
    query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      where('hasShares', '==', true)
    )
  )
  return resp.data().count
}

export async function getContractMetricsYesCount(contractId: string) {
  const resp = await getCountFromServer(
    query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      where('hasYesShares', '==', true)
    )
  )
  return resp.data().count
}

export async function getContractMetricsNoCount(contractId: string) {
  const resp = await getCountFromServer(
    query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      where('hasNoShares', '==', true)
    )
  )
  return resp.data().count
}
