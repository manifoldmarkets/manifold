import * as admin from 'firebase-admin'
import { APIError, authEndpoint, validate } from './helpers'
import { runTxn } from 'shared/txn/run-txn'
import { z } from 'zod'

const txnSchema = z.object({
  fromType: z.enum(['USER']),
  fromId: z.string(),
  amount: z.number().positive().safe(),
  toType: z.enum(['USER', 'CHARITY']),
  toId: z.string(),
  token: z.enum(['M$']),
  category: z.string(),
  description: z.string().optional(),
})

export const transact = authEndpoint(async (req, auth) => {
  const firestore = admin.firestore()
  const data = req.body
  const { fromType, fromId } = validate(data, txnSchema)

  if (fromId !== auth.uid)
    throw new APIError(403, 'You can only send txns from yourself!')

  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    const result = await runTxn(transaction, data)
    if (result.status == 'error') {
      throw new APIError(500, result.message ?? 'An unknown error occurred.')
    }
    return result
  })
})
