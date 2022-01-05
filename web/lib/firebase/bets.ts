import {
  collection,
  collectionGroup,
  query,
  onSnapshot,
  where,
  getDocs,
} from 'firebase/firestore'
import _ from 'lodash'
import { db } from './init'

export type Bet = {
  id: string
  userId: string
  contractId: string

  amount: number // bet size; negative if SELL bet
  outcome: 'YES' | 'NO'
  shares: number // dynamic parimutuel pool weight; negative if SELL bet

  probBefore: number
  probAfter: number

  sale?: {
    amount: number // amount user makes from sale
    betId: string // id of bet being sold
    // TODO: add sale time?
  }

  isSold?: boolean // true if this BUY bet has been sold

  createdTime: number
}

function getBetsCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'bets')
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

export function listenForRecentBets(
  timePeriodMs: number,
  setBets: (bets: Bet[]) => void
) {
  const recentQuery = query(
    collectionGroup(db, 'bets'),
    where('createdTime', '>', Date.now() - timePeriodMs)
  )
  return onSnapshot(recentQuery, (snap) => {
    const bets = snap.docs.map((doc) => doc.data() as Bet)

    bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)

    setBets(bets)
  })
}

export async function getRecentBets(timePeriodMs: number) {
  const recentQuery = query(
    collectionGroup(db, 'bets'),
    where('createdTime', '>', Date.now() - timePeriodMs)
  )

  const snapshot = await getDocs(recentQuery)
  const bets = snapshot.docs.map((doc) => doc.data() as Bet)

  bets.sort((bet1, bet2) => bet1.createdTime - bet2.createdTime)

  return bets
}
