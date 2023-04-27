import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  OrderByDirection,
  limit,
  Query,
  getCountFromServer,
} from 'firebase/firestore'

import { db } from './init'
import { Bet, BetFilter, LimitBet } from 'common/bet'
import { listenForValues } from './utils'
export type { Bet }

export const MAX_USER_BETS_LOADED = 10000

export const USER_BET_FILTER = {
  order: 'desc',
  limit: MAX_USER_BETS_LOADED,
  filterAntes: true,
} as const

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
  if (options?.beforeTime) {
    q = query(q, where('createdTime', '<', options.beforeTime))
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
  if (options?.isOpenLimitOrder) {
    q = query(
      q,
      where('isFilled', '==', false),
      where('isCancelled', '==', false)
      // where('limitProb', '>=', 0)
    )
  }
  if (options?.limit) {
    q = query(q, limit(options.limit))
  }
  return q
}

export async function getTotalBetCount(contractId: string) {
  const betsRef = query(
    collection(db, `contracts/${contractId}/bets`),
    where('isChallenge', '==', false),
    where('isRedemption', '==', false),
    where('isAnte', '==', false)
  )
  const snap = await getCountFromServer(betsRef)
  return snap.data().count
}

export function listenForBets(
  setBets: (bets: Bet[]) => void,
  options?: BetFilter
) {
  return listenForValues<Bet>(getBetsQuery(options), setBets)
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
