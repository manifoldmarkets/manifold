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
} from 'firebase/firestore'
import { uniq } from 'lodash'

import { db } from './init'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { getValues, listenForValues } from './utils'
import { getContractFromId } from './contracts'
import { filterDefined } from 'common/util/array'
export type { Bet }

function getBetsCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'bets')
}

export async function listAllBets(contractId: string) {
  const bets = await getValues<Bet>(getBetsCollection(contractId))
  bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)
  return bets
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
  setBets: (bets: Bet[]) => void
) {
  return listenForValues<Bet>(getBetsCollection(contractId), (bets) => {
    bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)
    setBets(bets)
  })
}

export async function getUserBets(
  userId: string,
  options: { includeRedemptions: boolean }
) {
  const { includeRedemptions } = options
  return getValues<Bet>(
    query(collectionGroup(db, 'bets'), where('userId', '==', userId))
  )
    .then((bets) =>
      bets.filter(
        (bet) => (includeRedemptions || !bet.isRedemption) && !bet.isAnte
      )
    )
    .catch((reason) => reason)
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
  const bets: Bet[] = await getUserBets(userId, { includeRedemptions: false })
  const contractIds = uniq(bets.map((bet) => bet.contractId))
  const contracts = await Promise.all(
    contractIds.map((contractId) => getContractFromId(contractId))
  )
  return filterDefined(contracts)
}

export function listenForUserBets(
  userId: string,
  setBets: (bets: Bet[]) => void,
  options: { includeRedemptions: boolean }
) {
  const { includeRedemptions } = options
  const userQuery = query(
    collectionGroup(db, 'bets'),
    where('userId', '==', userId),
    orderBy('createdTime', 'desc')
  )
  return listenForValues<Bet>(userQuery, (bets) => {
    setBets(
      bets.filter(
        (bet) => (includeRedemptions || !bet.isRedemption) && !bet.isAnte
      )
    )
  })
}

export function listenForUserContractBets(
  userId: string,
  contractId: string,
  setBets: (bets: Bet[]) => void
) {
  const betsQuery = query(
    collection(db, 'contracts', contractId, 'bets'),
    where('userId', '==', userId)
  )
  return listenForValues<Bet>(betsQuery, (bets) => {
    bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)
    setBets(bets)
  })
}

export function listenForUnfilledBets(
  contractId: string,
  setBets: (bets: LimitBet[]) => void
) {
  const betsQuery = query(
    collection(db, 'contracts', contractId, 'bets'),
    where('isFilled', '==', false),
    where('isCancelled', '==', false)
  )
  return listenForValues<LimitBet>(betsQuery, (bets) => {
    bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)
    setBets(bets)
  })
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
