import { postMessageToNative } from 'web/lib/native/post-message'
import { api } from '../api/api'
import { DELETE_PUSH_TOKEN } from 'common/notification'

export const setPushToken = async (pushToken: string) => {
  try {
    console.log('setting push token' + pushToken)
    await api('set-push-token', { pushToken })
  } catch (e) {
    console.error('error setting user push token', e)
    postMessageToNative('error', 'Error setting push token')
  }
}

export const handlePushNotificationPermissionStatus = async (
  status: 'denied' | 'undetermined'
) => {
  const privateUser = await api('me/private')
  if (!privateUser) return
  if (status === 'denied') {
    await setPushTokenRequestDenied()
  }
}

// Removes this account's push token from its private user record. Call on
// logout so notifications for the now-logged-out account stop being delivered
// to the device. Unlike setPushTokenRequestDenied, this does NOT mark the user
// as having rejected push notifications.
export const clearPushToken = async () => {
  await api('me/private/update', {
    pushToken: DELETE_PUSH_TOKEN,
  })
}

export const setPushTokenRequestDenied = async () => {
  console.log('push token denied')
  await api('me/private/update', {
    rejectedPushNotificationsOn: Date.now(),
    interestedInPushNotifications: false,
    pushToken: DELETE_PUSH_TOKEN,
  })
}
