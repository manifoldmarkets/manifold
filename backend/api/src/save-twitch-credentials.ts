import * as admin from 'firebase-admin'
import { typedEndpoint } from './helpers'

export const saveTwitchCredentials = typedEndpoint(
  'save-twitch',
  async (props, auth) => {
    const userId = auth.uid
    await firestore.doc(`private-users/${userId}`).update(props)
  }
)

const firestore = admin.firestore()
