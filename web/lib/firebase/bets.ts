import {
  collection,
  collectionGroup,
  query,
  onSnapshot,
  where,
  doc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './init'
import { User } from './users'

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

  // Currently, comments are created after the bet, not atomically with the bet.
  comment?: {
    text: string
    createdTime: number
    // Denormalized, for rendering comments
    userName?: string
    userUsername?: string
    userAvatarUrl?: string
  }
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

export async function createComment(
  contractId: string,
  betId: string,
  text: string,
  commenter: User
) {
  const betRef = doc(getBetsCollection(contractId), betId)
  return await updateDoc(betRef, {
    comment: {
      text: text,
      createdTime: Date.now(),
      userName: commenter.name,
      userUsername: commenter.username,
      userAvatarUrl: commenter.avatarUrl,
    },
  })
}
