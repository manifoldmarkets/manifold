import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import * as admin from 'firebase-admin'
import { auth } from 'web/lib/firebase/users'

export const config = { api: { bodyParser: true } }

function initAdmin() {
  // TODO: Support dev vs prod environments; maybe private instances too?
  // TODO: How do we get the Firebase Admin secret to exist here, _without_ leaking it
  // to PR preview branches from our users? (Maybe Vercel already does this safely?)
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? ''
  )
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  }
}
initAdmin()

async function getUserId(req: NextApiRequest, res: NextApiResponse) {
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
  const decodedToken = await admin.auth().verifyIdToken(payload)
  return decodedToken.uid
}

export type IncrementReq = {
  amount: number
}

export async function increment(req: IncrementReq) {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch('/api/v0/increment', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  })
  return await res.json()
}

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })

  const userId = await getUserId(req, res)

  // Use the admin API to increment the user's balance
  const firestore = admin.firestore()
  const user = await firestore.collection('users').doc(userId).get()
  // TODO: Validate request with Typescript or Zod?
  const amount = req.body.amount

  await user.ref.update({
    balance: user.data()?.balance + amount,
  })

  return res.status(200).json({ message: `Hello ${JSON.stringify(user)}` })
}
