import * as admin from 'firebase-admin'
import { APIError, type APIHandler } from './helpers'
import { LimitBet } from 'common/bet'

export const cancelBet: APIHandler<'bet/cancel/:betId'> = async (
  { betId },
  auth
) => {
  return await firestore.runTransaction(async (trans) => {
    const snap = await trans.get(
      firestore.collectionGroup('bets').where('id', '==', betId)
    )
    const betDoc = snap.docs[0]
    if (!betDoc?.exists) throw new APIError(404, 'Bet not found')
    const bet = betDoc.data() as LimitBet
    if (bet.userId !== auth.uid)
      throw new APIError(403, 'You can only cancel your own bets')
    if (bet.limitProb === undefined)
      throw new APIError(403, 'Not a limit order. Cannot cancel.')
    if (bet.isCancelled) throw new APIError(403, 'Bet already cancelled')

    const contractDoc = await trans.get(
      firestore.collection('contracts').doc(bet.contractId)
    )

    const now = Date.now()
    trans.update(betDoc.ref, { isCancelled: true })
    trans.update(contractDoc.ref, {
      lastBetTime: now,
      lastUpdatedTime: now,
    })

    return bet
  })
}

const firestore = admin.firestore()
