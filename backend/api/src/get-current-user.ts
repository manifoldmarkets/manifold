import { User } from 'common/user'
import * as admin from 'firebase-admin'
import { authEndpoint, APIError } from './helpers'

export const getcurrentuser = authEndpoint(async (_req, auth) => {
  const userDoc = firestore.doc(`users/${auth.uid}`)
  const [userSnap] = await firestore.getAll(userDoc)
  if (!userSnap.exists) throw new APIError(401, 'Your account was not found')

  const user = userSnap.data() as User

  return user
})

const firestore = admin.firestore()
