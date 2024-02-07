import * as admin from 'firebase-admin'
import { arrayRemove, deleteField } from 'firebase/firestore'

// for mobile or something?
export const setPushToken: APIHandler<'set-push-token'> = async (
  props,
  auth
) => {
  const { pushToken } = props

  await firebase.doc(`private-users/${auth.uid}`).update({
    'notificationPreferences.opt_out_all': arrayRemove('mobile'),
    pushToken,
    rejectedPushNotificationsOn: deleteField(),
    interestedInPushNotifications: deleteField(),
  })
}

const firebase = admin.firestore()
