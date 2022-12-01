import * as admin from 'firebase-admin'
import { NextApiRequest } from 'next'

import { PrivateUser } from 'common/user'
import { APIError } from 'common/api'

const firestore = admin.firestore()

export async function verifyUserId(req: NextApiRequest) {
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
