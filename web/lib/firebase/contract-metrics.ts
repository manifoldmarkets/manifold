import { ContractMetrics } from 'common/calculate-metrics'
import {
  query,
  limit,
  orderBy,
  where,
  collectionGroup,
  getDocs,
  getCountFromServer,
} from 'firebase/firestore'
import { db } from './init'

export const CONTRACT_METRICS_SORTED_INDICES = ['YES', 'NO']

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
