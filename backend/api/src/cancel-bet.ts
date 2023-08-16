import * as admin from 'firebase-admin'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { LimitBet } from 'common/bet'

const bodySchema = z.object({
  betId: z.string(),
})

export const cancelbet = authEndpoint(async (req, auth) => {
  const { betId } = validate(bodySchema, req.body)

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

    trans.update(betDoc.ref, { isCancelled: true })

    return { ...bet, isCancelled: true }
  })
})

const firestore = admin.firestore()
