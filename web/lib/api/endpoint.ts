import * as admin from 'firebase-admin'

import { APIError } from 'common/api'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
  CORS_ORIGIN_VERCEL,
} from 'common/envs/constants'
import { removeUndefinedProps } from 'common/util/object'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from './cors'
import { PrivateUser } from 'common/user'

export const newEndpoint = (
  fn: (req: NextApiRequest, userId: string) => Promise<Record<string, unknown>>
) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      initAdmin()
      await applyCorsHeaders(req, res, {
        origin: [
          CORS_ORIGIN_MANIFOLD,
          CORS_ORIGIN_VERCEL,
          CORS_ORIGIN_LOCALHOST,
        ],
        methods: 'POST',
      })
      const userId = await verifyUserId(req)
      const result = await fn(req, userId)
      res.status(200).json(result)
    } catch (e) {
      if (e instanceof APIError) {
        const json = removeUndefinedProps({
          error: e.message,
          details: e.details,
        })
        return res.status(e.code).json(json)
      }
      console.error('Error placing bet: ', e)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
}

function initAdmin() {
  if (admin.apps.length === 0) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? ''
    )
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  }
}

async function verifyUserId(req: NextApiRequest) {
  // Check for the correct bearer token. Taken from functions/src/api.ts
  const authHeader = req.headers.authorization ?? ''
  const authParts = authHeader.split(' ')
  if (authParts.length !== 2) {
    throw new APIError(403, 'Invalid Authorization header.')
  }

  const [scheme, payload] = authParts

  switch (scheme) {
    case 'Bearer':
      const decodedToken = await admin.auth().verifyIdToken(payload)
      return decodedToken.uid

    case 'Key':
      const key = payload
      const firestore = admin.firestore()
      const privateUsers = firestore.collection('private-users')
      const privateUserQ = await privateUsers.where('apiKey', '==', key).get()
      if (privateUserQ.empty) {
        throw new APIError(403, `No private user exists with API key ${key}`)
      }
      const privateUser = privateUserQ.docs[0].data() as PrivateUser
      return privateUser.id

    default:
      throw new APIError(403, 'Invalid auth scheme; must be "Bearer".')
  }
}
