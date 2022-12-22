import { NextApiRequest, NextApiResponse } from 'next'
import * as admin from 'firebase-admin'
import { groupBy, mapValues, sumBy } from 'lodash'
import { FieldValue, Transaction } from 'firebase-admin/firestore'
import { NextRequest } from 'next/server'

export function initAdmin() {
  // Right now, FIREBASE_SERVICE_ACCOUNT_KEY points at the dev-mantic-markets key
  // TODO: Support prod environment too
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? ''
  )
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  }
}

export async function getUserId(req: NextApiRequest, res: NextApiResponse) {
  // Check for the correct bearer token. Taken from functions/src/api.ts
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
  // Log how long this takes
  const decodedToken = await admin.auth().verifyIdToken(payload)
  return decodedToken.uid
}

// Copied from functions/src/utils
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
