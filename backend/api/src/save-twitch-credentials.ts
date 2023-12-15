import * as admin from 'firebase-admin'
import { type APIHandler } from './helpers'

export const saveTwitchCredentials: APIHandler<'save-twitch'> = async (
  props,
  auth
) => {
  const userId = auth.uid
  await firestore.doc(`private-users/${userId}`).update(props)
}

const firestore = admin.firestore()
