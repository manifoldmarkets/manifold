import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { type APIHandler } from './helpers/endpoint'

export const updateNotifSettings: APIHandler<'update-notif-settings'> = async (
  { type, medium, enabled },
  auth
) => {
  await firestore.doc(`private-users/${auth.uid}`).update({
    [`notificationPreferences.${type}`]: enabled
      ? FieldValue.arrayUnion(medium)
      : FieldValue.arrayRemove(medium),
  })
}

const firestore = admin.firestore()
