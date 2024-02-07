import * as admin from 'firebase-admin'
import { type APIHandler } from './helpers/endpoint'
import { removeUndefinedProps } from 'common/util/object'

export const updateNotifSettings: APIHandler<'update-notif-settings'> = async (
  props,
  auth
) => {
  await firestore
    .doc(`private-users/${auth.uid}/notificationPreferences`)
    .update(removeUndefinedProps(props))
}

const firestore = admin.firestore()
