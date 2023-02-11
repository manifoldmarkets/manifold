import { User } from 'common/user'
import * as admin from 'firebase-admin'
import { newEndpoint, APIError } from './helpers'

export const getcurrentuser = newEndpoint(
  { method: 'GET' },
  async (_req, auth) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const [userSnap] = await firestore.getAll(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found.')

    const user = userSnap.data() as User

    return user
  }
)

const firestore = admin.firestore()
