import { NextApiRequest, NextApiResponse } from 'next'
import * as admin from 'firebase-admin'
import { groupBy, mapValues, sumBy } from 'lodash'
import { FieldValue, Transaction } from 'firebase-admin/firestore'
import { APIError } from 'common/api'
import { ENV } from 'common/envs/constants'

export function initAdmin() {
  // This is the stringified JSON of the Firebase Admin SDK service account key
  // Configured on Vercel, eg for dev: https://vercel.com/mantic/dev/settings/environment-variables
  // For local development, run `vercel env pull` from web/: https://vercel.com/docs/concepts/projects/environment-variables#development-environment-variables
  // You'll also need to delete the quotes around the key, eg `PROD_FIREBASE_SERVICE_ACCOUNT_KEY={...}`
  const key = process.env[`${ENV}_FIREBASE_SERVICE_ACCOUNT_KEY`]
  const serviceAccount = JSON.parse(key ?? '')
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  }
}

export async function getUserId(req: NextApiRequest, res: NextApiResponse) {
  // Check for the correct bearer token. Taken from backend/src/api.ts
  const authHeader = req.headers.authorization ?? ''
  const authParts = authHeader.split(' ')
  if (authParts.length !== 2) {
    res.status(403).json({ error: 'Invalid Authorization header.' })
  }
  const [scheme, payload] = authParts
  if (scheme !== 'Bearer') {
    // TODO: Support API Key too
    res.status(403).json({ error: 'Invalid auth scheme; must be "Bearer".' })
  }
  // Seems to involve a roundtrip to Firebase; could we skip? (Or locate Vercel server such that this is fast?)
  const decodedToken = await admin.auth().verifyIdToken(payload)
  return decodedToken.uid
}

export async function safeGet<T>(
  path: string,
  transaction?: admin.firestore.Transaction
): Promise<T> {
  const doc = transaction
    ? await transaction.get(admin.firestore().doc(path))
    : await admin.firestore().doc(path).get()
  if (!doc.exists) {
    throw new APIError(404, `Document not found: ${path}`)
  }
  return doc.data() as T
}

// Copied from backend/src/utils
export const payUsers = (
  transaction: Transaction,
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[]
) => {
  const mergedPayouts = checkAndMergePayouts(payouts)
  for (const { userId, payout, deposit } of mergedPayouts) {
    updateUserBalance(transaction, userId, payout, deposit)
  }
}

const updateUserBalance = (
  transaction: Transaction,
  userId: string,
  balanceDelta: number,
  depositDelta: number
) => {
  const firestore = admin.firestore()
  const userDoc = firestore.doc(`users/${userId}`)

  // Note: Balance is allowed to go negative.
  transaction.update(userDoc, {
    balance: FieldValue.increment(balanceDelta),
    totalDeposits: FieldValue.increment(depositDelta),
  })
}

const checkAndMergePayouts = (
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[]
) => {
  for (const { payout, deposit } of payouts) {
    if (!isFinite(payout)) {
      throw new Error('Payout is not finite: ' + payout)
    }
    if (deposit !== undefined && !isFinite(deposit)) {
      throw new Error('Deposit is not finite: ' + deposit)
    }
  }

  const groupedPayouts = groupBy(payouts, 'userId')
  return Object.values(
    mapValues(groupedPayouts, (payouts, userId) => ({
      userId,
      payout: sumBy(payouts, 'payout'),
      deposit: sumBy(payouts, (p) => p.deposit ?? 0),
    }))
  )
}
