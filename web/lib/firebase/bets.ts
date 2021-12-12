import { collection, onSnapshot } from 'firebase/firestore'
import { db } from './init'

export type Bet = {
  id: string
  userId: string
  contractId: string
  amount: number // Amount of bet
  outcome: 'YES' | 'NO' // Chosen outcome
  dpmWeight: number // Dynamic Parimutuel weight
  probBefore: number
  probAverage: number
  probAfter: number
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
