import * as admin from 'firebase-admin'
import { APIError, newEndpoint } from './helpers'
import { runTxn } from 'shared/run-txn'

// TODO: We totally fail to validate most of the input to this function,
// so anyone can spam our database with malformed transactions.

export const transact = newEndpoint({}, async (req, auth) => {
  const data = req.body
  const { amount, fromType, fromId } = data

  if (fromType !== 'USER')
    throw new APIError(400, "From type is only implemented for type 'user'.")

  if (fromId !== auth.uid)
    throw new APIError(
      403,
      'Must be authenticated with userId equal to specified fromId.'
    )

  if (isNaN(amount) || !isFinite(amount))
    throw new APIError(400, 'Invalid amount')

  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    const result = await runTxn(transaction, data)
    if (result.status == 'error') {
      throw new APIError(500, result.message ?? 'An unknown error occurred.')
    }
    return result
  })
})

const firestore = admin.firestore()
