import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import _ from 'lodash'

import { db } from './init'
import { Bet } from '../../../common/bet'
import { Contract } from '../../../common/contract'
import { getValues, listenForValues } from './utils'
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

export function listenForUserBets(
  userId: string,
  setBets: (bets: Bet[]) => void
) {
  const userQuery = query(
    collectionGroup(db, 'bets'),
    where('userId', '==', userId)
  )
  return listenForValues<Bet>(userQuery, (bets) => {
    bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)
    setBets(bets)
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
