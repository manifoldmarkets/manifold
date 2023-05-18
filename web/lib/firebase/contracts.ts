import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  Query,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore'
import { sum } from 'lodash'
import { coll, getValues, listenForValue, listenForValues } from './utils'
import { BinaryContract, Contract, contractPath } from 'common/contract'
import { formatMoney, formatPercent } from 'common/util/format'
import { ENV_CONFIG } from 'common/envs/constants'
import { getLiquidity } from 'common/calculate-cpmm-multi'
import { getDisplayProbability } from 'common/calculate'

export const contracts = coll<Contract>('contracts')

export type { Contract }

export function contractPathWithoutContract(
  creatorUsername: string,
  slug: string
) {
  return `/${creatorUsername}/${slug}`
}

export function contractUrl(contract: Contract) {
  return `https://${ENV_CONFIG.domain}${contractPath(contract)}`
}

export function contractPool(contract: Contract) {
  return contract.mechanism === 'cpmm-1'
    ? formatMoney(contract.totalLiquidity)
    : contract.mechanism === 'cpmm-2'
    ? formatMoney(getLiquidity(contract.pool))
    : contract.mechanism === 'dpm-2'
    ? formatMoney(sum(Object.values(contract.pool)))
    : 'Empty pool'
}

export function getBinaryProbPercent(contract: BinaryContract) {
  return formatPercent(getDisplayProbability(contract))
}

export function tradingAllowed(contract: Contract) {
  return (
    !contract.isResolved &&
    (!contract.closeTime || contract.closeTime > Date.now())
  )
}

// Push contract to Firestore
export async function setContract(contract: Contract) {
  await setDoc(doc(contracts, contract.id), contract)
}

export async function updateContract(
  contractId: string,
  update: Partial<Contract>
) {
  await updateDoc(doc(contracts, contractId), update)
}

export async function getContractFromId(contractId: string) {
  const result = await getDoc(doc(contracts, contractId))
  return result.exists() ? result.data() : undefined
}

export async function getContractFromSlug(slug: string) {
  const q = query(contracts, where('slug', '==', slug))
  const snapshot = await getDocs(q)
  return snapshot.empty ? undefined : snapshot.docs[0].data()
}

export const tournamentContractsByGroupSlugQuery = (slug: string) =>
  query(
    contracts,
    where('groupSlugs', 'array-contains', slug),
    orderBy('popularityScore', 'desc')
  )

export async function listAllContracts(
  n: number,
  before?: string,
  sortDescBy = 'createdTime'
): Promise<Contract[]> {
  let q = query(contracts, orderBy(sortDescBy, 'desc'), limit(n))
  if (before != null) {
    const snap = await getDoc(doc(contracts, before))
    q = query(q, startAfter(snap))
  }
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => doc.data())
}

export function getUserBetContracts(userId: string) {
  return getValues<Contract>(getUserBetContractsQuery(userId))
}

export const MAX_USER_BET_CONTRACTS_LOADED = 1000
export function getUserBetContractsQuery(userId: string) {
  return query(
    contracts,
    where('uniqueBettorIds', 'array-contains', userId),
    limit(MAX_USER_BET_CONTRACTS_LOADED)
  ) as Query<Contract>
}

export function listenForContract(
  contractId: string,
  setContract: (contract: Contract | null) => void
) {
  const contractRef = doc(contracts, contractId)
  return listenForValue<Contract>(contractRef, setContract)
}

export function listenForContractFollows(
  contractId: string,
  setFollowIds: (followIds: string[]) => void
) {
  const follows = collection(contracts, contractId, 'follows')
  return listenForValues<{ id: string }>(follows, (docs) =>
    setFollowIds(docs.map(({ id }) => id))
  )
}

export async function followContract(contractId: string, userId: string) {
  const followDoc = doc(collection(contracts, contractId, 'follows'), userId)
  return await setDoc(followDoc, {
    id: userId,
    createdTime: Date.now(),
  })
}

export async function unFollowContract(contractId: string, userId: string) {
  const followDoc = doc(collection(contracts, contractId, 'follows'), userId)
  await deleteDoc(followDoc)
}

export const trendingContractsQuery = query(
  contracts,
  where('isResolved', '==', false),
  where('visibility', '==', 'public'),
  orderBy('popularityScore', 'desc')
)

export async function getTrendingContracts(maxContracts = 10) {
  return await getValues<Contract>(
    query(trendingContractsQuery, limit(maxContracts))
  )
}
