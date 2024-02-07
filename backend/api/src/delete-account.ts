import { APIError } from 'common/api/utils'
import { deleteField } from 'firebase/firestore'
import { APIHandler } from './helpers/endpoint'
import * as admin from 'firebase-admin'
import { User } from 'common/user'

export const deleteAccount: APIHandler<'delete-account'> = async (
  { username },
  auth
) => {
  await firestore.runTransaction(async (trans) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await trans.get(userDoc)

    if (!userSnap.exists) throw new APIError(401, 'Your account was not found')
    const user = userSnap.data() as User

    if (user.username !== username)
      throw new APIError(403, `Incorrect credentials for ${username}`)

    const privateUserDoc = firestore.doc(`private-users/${auth.uid}`)

    trans.update(userDoc, {
      userDeleted: true,
      isBannedFromPosting: true,
    })
    trans.update(privateUserDoc, {
      email: deleteField(),
      twitchInfo: deleteField(),
      apiKey: deleteField(),
      discordId: deleteField(),
    })
  })
}

const firestore = admin.firestore()
