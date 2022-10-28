import * as admin from 'firebase-admin'
import { APIError, newEndpoint, validate } from './api'
import { z } from 'zod'
import { User } from 'common/user'

const bodySchema = z.object({
  amount: z.number(),
})

export const increment = newEndpoint({}, async (req, auth) => {
  return await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) {
      throw new APIError(500, `User ${auth.uid} not found`)
    }
    const user = userSnap.data() as User

    const { amount } = validate(bodySchema, req.body)

    const newBalance = user.balance + amount

    transaction.update(userDoc, { balance: newBalance })

    return { amount: newBalance }
  })
})

const firestore = admin.firestore()
