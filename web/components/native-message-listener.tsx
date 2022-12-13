import { app } from 'web/lib/firebase/init'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { getSourceUrl, Notification } from 'common/notification'
import {
  handlePushNotificationPermissionStatus,
  setPushToken,
} from 'web/lib/firebase/notifications'
import { useRouter } from 'next/router'
import { getIsNative, setIsNative } from 'web/lib/native/is-native'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { webToNativeMessageType } from 'common/native-message'

export const NativeMessageListener = () => {
  const router = useRouter()
  const handleNativeMessage = async (type: string, data: any) => {
    if (type === 'setIsNative') {
      setIsNative(true, data.platform)
    } else if (type === 'nativeFbUser') {
      await setFirebaseUserViaJson(data, app, true)
    } else if (type === 'pushNotificationPermissionStatus') {
      const { status, userId } = data
      await handlePushNotificationPermissionStatus(userId, status)
    } else if (type === 'pushToken') {
      const { token, userId } = data
      await setPushToken(userId, token)
    } else if (type === 'notification') {
      const notification = data as Notification
      const sourceUrl = getSourceUrl(notification)
      console.log('sourceUrl', sourceUrl)
      try {
        router.push(sourceUrl)
      } catch (e) {
        console.log(`Error navigating to notification route ${sourceUrl}`, e)
      }
    } else if (type === 'link') {
      console.log('link', data)
      const url = data['url'] ?? data
      const newRoute = url.startsWith('/') ? url : '/' + url
      try {
        router.push(newRoute)
      } catch (e) {
        console.log(`Error navigating to link route ${newRoute}`, e)
      }
    }
  }
  useNativeMessages(
    [
      'setIsNative',
      'nativeFbUser',
      'pushNotificationPermissionStatus',
      'pushToken',
      'notification',
      'link',
    ],
    handleNativeMessage
  )

  return <div />
}

export const postMessageToNative = (
  type: webToNativeMessageType,
  data: any
) => {
  const isNative = getIsNative()
  if (!isNative) return
  ;(window as any).ReactNativeWebView.postMessage(
    JSON.stringify({
      type,
      data,
    })
  )
}
