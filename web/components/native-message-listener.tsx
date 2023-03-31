import { app } from 'web/lib/firebase/init'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { getSourceUrl, Notification } from 'common/notification'
import {
  handlePushNotificationPermissionStatus,
  markNotificationAsSeen,
  setPushToken,
} from 'web/lib/firebase/notifications'
import { useRouter } from 'next/router'
import {
  getIsNative,
  setInstalledAppPlatform,
  setIsNative,
} from 'web/lib/native/is-native'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { webToNativeMessageType } from 'common/native-message'
import { useEffect } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { useEvent } from 'web/hooks/use-event'
import { auth } from 'web/lib/firebase/users'
import { User as FirebaseUser } from 'firebase/auth'

export const NativeMessageListener = () => {
  const router = useRouter()
  const privateUser = usePrivateUser()

  useEffect(() => {
    postMessageToNative('startedListening', {})
  }, [])

  useEffect(() => {
    const { nativePlatform } = router.query
    if (nativePlatform !== undefined) {
      const platform = nativePlatform as string
      setIsNative(true, platform)
      if (privateUser) setInstalledAppPlatform(privateUser, platform)
    }
  }, [privateUser, router.query])

  const handleNativeMessage = useEvent(async (type: string, data: any) => {
    if (type === 'setIsNative') {
      setIsNative(true, data.platform)
      if (privateUser) setInstalledAppPlatform(privateUser, data.platform)
    } else if (type === 'nativeFbUser') {
      console.log('received nativeFbUser')
      const user = data as FirebaseUser
      if (auth.currentUser?.email !== user.email)
        await setFirebaseUserViaJson(user, app, true)
    } else if (type === 'pushNotificationPermissionStatus') {
      const { status, userId } = data
      await handlePushNotificationPermissionStatus(userId, status)
    } else if (type === 'pushToken') {
      const { token, userId } = data
      await setPushToken(userId, token)
    } else if (type === 'notification') {
      const notification = data as Notification
      if (privateUser) markNotificationAsSeen(privateUser.id, notification.id)
      const sourceUrl = getSourceUrl(notification)
      console.log('sourceUrl', sourceUrl)
      try {
        router.push(sourceUrl)
      } catch (e) {
        console.log(`Error navigating to notification route ${sourceUrl}`, e)
      }
    } else if (type === 'link') {
      const url = data['url'] ?? data
      const newRoute = url.startsWith('/') ? url : '/' + url
      console.log('Received link from native, current route', router.asPath)
      if (router.asPath === newRoute) return
      console.log('Navigating to link from native:', newRoute)
      try {
        await router.push(newRoute)
      } catch (e) {
        console.log(`Error navigating to linked route`, e)
      }
    }
  })

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
  ;(window as any).ReactNativeWebView?.postMessage(
    JSON.stringify({
      type,
      data,
    })
  )
}
