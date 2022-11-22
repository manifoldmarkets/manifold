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
import { filterDefined } from 'common/util/array'

export type UserIdAndPosition = {
  userId: string
  contractMetrics: ContractMetrics
}
export type UserContractMetrics = {
  YES: UserIdAndPosition[]
  NO: UserIdAndPosition[]
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
      limit(Math.round(count / 2))
    )
  )
  const noSnap = await getDocs(
    query(
      collectionGroup(db, 'contract-metrics'),
      where('contractId', '==', contractId),
      where('hasNoShares', '==', true),
      orderBy('totalShares.NO', 'desc'),
      limit(Math.round(count / 2))
    )
  )
  const outcomeToDetails = {
    YES: filterDefined(
      yesSnap.docs.map((doc) => {
        const userId = doc.ref.parent.parent?.id
        if (!userId) return undefined
        return {
          userId,
          contractMetrics: doc.data() as ContractMetrics,
        }
      })
    ),
    NO: filterDefined(
      noSnap.docs.map((doc) => {
        const userId = doc.ref.parent.parent?.id
        if (!userId) return undefined
        return {
          userId,
          contractMetrics: doc.data() as ContractMetrics,
        }
      })
    ),
  }

  return outcomeToDetails
}
