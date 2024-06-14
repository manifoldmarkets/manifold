import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { APIHandler } from './helpers/endpoint'

// for mobile or something?
export const setPushToken: APIHandler<'set-push-token'> = async (
  props,
  auth
) => {
  const { pushToken } = props

  await firebase.doc(`private-users/${auth.uid}`).update({
    'notificationPreferences.opt_out_all': FieldValue.arrayRemove('mobile'),
    pushToken,
    rejectedPushNotificationsOn: FieldValue.delete(),
    interestedInPushNotifications: FieldValue.delete(),
  })
}

const firebase = admin.firestore()
