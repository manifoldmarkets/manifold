import { NextApiRequest, NextApiResponse } from 'next'
import * as admin from 'firebase-admin'
import { ENV } from 'common/envs/constants'
import { getServiceAccountCredentials } from 'common/secrets'

export function initAdmin() {
  // This is the stringified JSON of the Firebase Admin SDK service account key
  // Configured on Vercel, eg for dev: https://vercel.com/mantic/dev/settings/environment-variables
  const serviceAccount = getServiceAccountCredentials(ENV)
  console.log('service account', serviceAccount)

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
