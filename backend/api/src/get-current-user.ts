import { User } from 'common/user'
import * as admin from 'firebase-admin'
import { APIError, typedEndpoint } from './helpers'

export const getCurrentUser = typedEndpoint('me', async (_, auth) => {
  const userDoc = firestore.doc(`users/${auth.uid}`)
  const [userSnap] = await firestore.getAll(userDoc)
  if (!userSnap.exists) throw new APIError(401, 'Your account was not found')

  return userSnap.data() as User
})

const firestore = admin.firestore()
