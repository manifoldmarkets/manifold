import {
  collection,
  collectionGroup,
  query,
  onSnapshot,
  where,
  orderBy,
} from 'firebase/firestore'
import _ from 'lodash'

import { db } from './init'
import { Bet } from '../../../common/bet'
import { Contract } from '../../../common/contract'
import { getValues } from './utils'
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

export function listenForBets(
  contractId: string,
  setBets: (bets: Bet[]) => void
) {
  return onSnapshot(getBetsCollection(contractId), (snap) => {
    const bets = snap.docs.map((doc) => doc.data() as Bet)

    bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)

    setBets(bets)
  })
}

export function listenForUserBets(
  userId: string,
  setBets: (bets: Bet[]) => void
) {
  const userQuery = query(
    collectionGroup(db, 'bets'),
    where('userId', '==', userId)
  )

  return onSnapshot(userQuery, (snap) => {
    const bets = snap.docs.map((doc) => doc.data() as Bet)
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

  return bets ?? []
}
