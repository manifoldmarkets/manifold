import { doc, setDoc } from 'firebase/firestore'
import { db } from './init'

export type Bet = {
  id: string
  userId: string
  contractId: string

  amount: number // Amount of USD bid
  outcome: 'YES' | 'NO' // Chosen outcome

  // Calculate and replace these on server?
  createdTime: number
  dpmWeight: number // Dynamic Parimutuel weight
}

// Push bet to Firestore
// TODO: Should bets be subcollections under its contract?
export async function saveBet(bet: Bet) {
  const docRef = doc(db, 'contracts', bet.contractId, 'bets', bet.id)
  await setDoc(docRef, bet)
}
