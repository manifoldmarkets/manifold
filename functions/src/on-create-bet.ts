import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Bet } from '../../common/bet'

const firestore = admin.firestore()

export const onCreateBet = functions.firestore
  .document('contracts/{contractId}/bets/{betId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }
    const bet = change.data() as Bet
    const lastBetTime = bet.createdTime

    await firestore
      .collection('contracts')
      .doc(contractId)
      .update({ lastBetTime, lastUpdatedTime: Date.now() })
  })
