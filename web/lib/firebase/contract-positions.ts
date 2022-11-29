import {
  query,
  limit,
  orderBy,
  where,
  collectionGroup,
  getDocs,
} from 'firebase/firestore'
import { db } from './init'
import { ContractPositions } from 'common/contract-positions'

export const CONTRACT_POSITIONS_SORTED_INDICES = ['YES', 'NO']

export type ContractPositionsByOutcome = Record<string, ContractPositions[]>

// If you want shares sorted in descending order you have to make a new index for that outcome.
// You can still get all users with contract-positions and shares without the index and sort them afterwards
// See use-contract-positions.ts to extend this for more outcomes
export async function getBinaryContractUserContractPositions(
  contractId: string,
  count: number
) {
  const yesSnap = await getDocs(
    query(
      collectionGroup(db, 'contract-positions'),
      where('contractId', '==', contractId),
      where('hasYesShares', '==', true),
      orderBy('totalShares.YES', 'desc'),
      limit(count)
    )
  )
  const noSnap = await getDocs(
    query(
      collectionGroup(db, 'contract-positions'),
      where('contractId', '==', contractId),
      where('hasNoShares', '==', true),
      orderBy('totalShares.NO', 'desc'),
      limit(count)
    )
  )
  const outcomeToDetails = {
    YES: yesSnap.docs.map((doc) => doc.data() as ContractPositions),
    NO: noSnap.docs.map((doc) => doc.data() as ContractPositions),
  }

  return outcomeToDetails
}
