import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  OrderByDirection,
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

export const MAX_USER_BETS_LOADED = 10000

export const USER_BET_FILTER = {
  order: 'desc',
  limit: MAX_USER_BETS_LOADED,
  filterAntes: true,
} as const

export type BetFilter = {
  contractId?: string
  userId?: string
  filterChallenges?: boolean
  filterRedemptions?: boolean
  filterAntes?: boolean
  afterTime?: number
  order?: OrderByDirection
  limit?: number
}

export const getBetsQuery = (options?: BetFilter) => {
  let q = query(
    collectionGroup(db, 'bets') as Query<Bet>,
    orderBy('createdTime', options?.order)
  )
  if (options?.contractId) {
    q = query(q, where('contractId', '==', options.contractId))
  }
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
  if (options?.limit) {
    q = query(q, limit(options.limit))
  }
  return q
}

export async function listBets(options?: BetFilter) {
  return await getValues<Bet>(getBetsQuery(options))
}

export function listenForBets(
  setBets: (bets: Bet[]) => void,
  options?: BetFilter
) {
  return listenForValues<Bet>(getBetsQuery(options), setBets)
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
  const bets = await listBets({ userId, ...USER_BET_FILTER })
  const contractIds = uniq(bets.map((bet) => bet.contractId))
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

export async function getSwipes(userId: string) {
  const swipeCollection = collection(db, `/private-users/${userId}/seenMarkets`)
  return getValues(swipeCollection)
}
