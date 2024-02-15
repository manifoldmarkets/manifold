import * as admin from 'firebase-admin'
import { type APIHandler } from './helpers/endpoint'
import { removeUndefinedProps } from 'common/util/object'
import { mapKeys } from 'lodash'

export const saveTwitchCredentials: APIHandler<'save-twitch'> = async (
  props,
  auth
) => {
  // partial update
  const update = mapKeys(
    removeUndefinedProps(props.twitchInfo),
    (_value, key) => `twitchInfo.${key}`
  )

  await firestore.doc(`private-users/${auth.uid}`).update(update)
}

const firestore = admin.firestore()
