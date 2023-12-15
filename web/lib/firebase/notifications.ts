import { deleteField, doc, updateDoc } from 'firebase/firestore'
import {
  getPrivateUser,
  privateUsers,
  updatePrivateUser,
} from 'web/lib/firebase/users'
import { removeUndefinedProps } from 'common/util/object'

import { postMessageToNative } from 'web/lib/native/post-message'

export const setPushToken = async (userId: string, pushToken: string) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  console.log('setting push token' + pushToken + 'for user' + privateUser.id)
  try {
    const prefs = privateUser.notificationPreferences
    prefs.opt_out_all = prefs.opt_out_all.filter((p) => p !== 'mobile')
    await updateDoc(
      doc(privateUsers, privateUser.id),
      removeUndefinedProps({
        ...privateUser,
        notificationPreferences: prefs,
        pushToken,
        rejectedPushNotificationsOn: privateUser.rejectedPushNotificationsOn
          ? deleteField()
          : undefined,
        interestedInPushNotifications: privateUser.interestedInPushNotifications
          ? deleteField()
          : undefined,
      })
    )
  } catch (e) {
    console.error('error setting user push token', e)
    postMessageToNative('error', 'Error setting push token')
  }
}

export const handlePushNotificationPermissionStatus = async (
  userId: string,
  status: 'denied' | 'undetermined'
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser || privateUser.pushToken) return
  if (status === 'denied') {
    await setPushTokenRequestDenied(privateUser.id)
  }
}

export const setPushTokenRequestDenied = async (userId: string) => {
  console.log('push token denied', userId)
  await updatePrivateUser(userId, {
    rejectedPushNotificationsOn: Date.now(),
    interestedInPushNotifications: false,
  })
}
