import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  QueryConstraint,
  limit,
  startAfter,
  doc,
  getDocs,
  getDoc,
  DocumentSnapshot,
  Query,
} from 'firebase/firestore'
import { uniq } from 'lodash'

import { db } from './init'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { getValues, listenForValues } from './utils'
import { getContractFromId } from './contracts'
import { filterDefined } from 'common/util/array'
export type { Bet }

export type BetFilter = {
  userId?: string
  filterChallenges?: boolean
  filterRedemptions?: boolean
  filterAntes?: boolean
  afterTime?: number
}

function getBetsCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'bets')
}

const getContractBetsQuery = (contractId: string, options?: BetFilter) => {
  let q = query(getBetsCollection(contractId))
  if (options?.userId) {
    q = query(q, where('userId', '==', options.userId))
  }
  if (options?.afterTime) {
    q = query(q, where('createdTime', '>', options.afterTime))
  }
  if (options?.filterChallenges) {
    q = query(q, where('isChallenge', '==', false))
  }
  if (options?.filterAntes) {
    q = query(q, where('isAnte', '==', false))
  }
  if (options?.filterRedemptions) {
    q = query(q, where('isRedemption', '==', false))
  }
  return q
}

export async function listFirstNBets(
  contractId: string,
  n: number,
  options?: BetFilter
) {
  const q = query(
    getContractBetsQuery(contractId, options),
    orderBy('createdTime'),
    limit(n)
  )
  return await getValues<Bet>(q)
}

export async function listAllBets(contractId: string, options?: BetFilter) {
  return await getValues<Bet>(getContractBetsQuery(contractId, options))
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

// Define "recent" as "<24 hours ago" for now
const recentBetsQuery = query(
  collectionGroup(db, 'bets'),
  where('createdTime', '>', Date.now() - DAY_IN_MS),
  orderBy('createdTime', 'desc')
)

export async function getRecentBets() {
  return getValues<Bet>(recentBetsQuery)
}

export function listenForRecentBets(setBets: (bets: Bet[]) => void) {
  return listenForValues<Bet>(recentBetsQuery, setBets)
}

export async function getRecentContractBets(contractId: string) {
  const q = query(
    getBetsCollection(contractId),
    where('createdTime', '>', Date.now() - DAY_IN_MS),
    orderBy('createdTime', 'desc')
  )

  return getValues<Bet>(q)
}

export function listenForBets(
  contractId: string,
  setBets: (bets: Bet[]) => void,
  options?: BetFilter
) {
  const q = getContractBetsQuery(contractId, options)
  return listenForValues<Bet>(q, setBets)
}

export async function getUserBets(userId: string) {
  return getValues<Bet>(getUserBetsQuery(userId))
}

export const MAX_USER_BETS_LOADED = 10000
export function getUserBetsQuery(userId: string) {
  return query(
    collectionGroup(db, 'bets'),
    where('userId', '==', userId),
    orderBy('createdTime', 'desc'),
    limit(MAX_USER_BETS_LOADED)
  ) as Query<Bet>
}

export async function getBets(options: {
  userId?: string
  contractId?: string
  before?: string
  limit: number
}) {
  const { userId, contractId, before } = options

  const queryParts: QueryConstraint[] = [
    orderBy('createdTime', 'desc'),
    limit(options.limit),
  ]
  if (userId) {
    queryParts.push(where('userId', '==', userId))
  }
  if (before) {
    let beforeSnap: DocumentSnapshot
    if (contractId) {
      beforeSnap = await getDoc(
        doc(db, 'contracts', contractId, 'bets', before)
      )
    } else {
      beforeSnap = (
        await getDocs(
          query(collectionGroup(db, 'bets'), where('id', '==', before))
        )
      ).docs[0]
    }
    queryParts.push(startAfter(beforeSnap))
  }

  const querySource = contractId
    ? collection(db, 'contracts', contractId, 'bets')
    : collectionGroup(db, 'bets')
  return await getValues<Bet>(query(querySource, ...queryParts))
}

export async function getContractsOfUserBets(userId: string) {
  const bets = await getUserBets(userId)
  const contractIds = uniq(
    bets.filter((b) => !b.isAnte).map((bet) => bet.contractId)
  )
  const contracts = await Promise.all(
    contractIds.map((contractId) => getContractFromId(contractId))
  )
  return filterDefined(contracts)
}

export function listenForUnfilledBets(
  contractId: string,
  setBets: (bets: LimitBet[]) => void
) {
  const betsQuery = query(
    collection(db, 'contracts', contractId, 'bets'),
    where('isFilled', '==', false),
    where('isCancelled', '==', false),
    orderBy('createdTime', 'desc')
  )
  return listenForValues<LimitBet>(betsQuery, setBets)
}

export function withoutAnteBets(contract: Contract, bets?: Bet[]) {
  const { createdTime } = contract

  if (
    bets &&
    bets.length >= 2 &&
    bets[0].createdTime === createdTime &&
    bets[1].createdTime === createdTime
  ) {
    return bets.slice(2)
  }

  return bets?.filter((bet) => !bet.isAnte) ?? []
}

export function listenForLiveBets(
  count: number,
  setBets: (bets: Bet[]) => void
) {
  const betsQuery = query(
    collectionGroup(db, 'bets'),
    orderBy('createdTime', 'desc'),
    limit(count)
  )
  return listenForValues<Bet>(betsQuery, setBets)
}

export async function getSwipes(userId: string) {
  const swipeCollection = collection(db, `/private-users/${userId}/seenMarkets`)
  return getValues(swipeCollection)
}
