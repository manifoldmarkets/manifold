import {
  collection,
  collectionGroup,
  query,
  onSnapshot,
  where,
} from 'firebase/firestore'
import { db } from './init'

export type Bet = {
  id: string
  userId: string
  contractId: string

  amount: number // bet size; negative if SELL bet
  outcome: 'YES' | 'NO'
  dpmWeight: number // dynamic parimutuel pool weight; negative if SELL bet

  probBefore: number
  probAverage: number
  probAfter: number

  sale?: {
    amount: { YES: number, NO: number } // amount user makes from YES and NO pools from sale
    betId: string // id of bet being sold
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
