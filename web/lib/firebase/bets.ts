import {
  collection,
  collectionGroup,
  query,
  onSnapshot,
  where,
} from 'firebase/firestore'
import _ from 'lodash'

import { db } from './init'
import { Bet } from '../../../common/bet'
export type { Bet }

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
