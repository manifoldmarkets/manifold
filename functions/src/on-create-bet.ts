import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getContract } from './utils'
import { Bet } from '../../common/bet'

const firestore = admin.firestore()

export const onCreateBet = functions.firestore
  .document('contracts/{contractId}/bets/{betId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }

    const contract = await getContract(contractId)
    if (!contract)
      throw new Error('Could not find contract corresponding with bet')

    const bet = change.data() as Bet
    const lastBetTime = bet.createdTime

    await firestore
      .collection('contracts')
      .doc(contract.id)
      .update({ lastBetTime, lastUpdatedTime: Date.now() })
  })
