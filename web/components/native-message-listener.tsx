import { app } from 'web/lib/firebase/init'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { useEffect } from 'react'
import { Notification } from 'common/notification'
import {
  getSourceUrl,
  handlePushNotificationPermissionStatus,
  setPushToken,
} from 'web/lib/firebase/notifications'
import { useRouter } from 'next/router'
import { getIsNative, setIsNative } from 'web/lib/native/is-native'

export const NativeMessageListener = () => {
  const router = useRouter()

  const handleNativeMessage = async (e: any) => {
    let event
    try {
      event = JSON.parse(e.data)
    } catch (e) {
      return
    }
    const { type, data } = event
    console.log('Received native event: ', event)
    if (type === 'setIsNative') {
      setIsNative(true)
    } else if (type === 'nativeFbUser') {
      await setFirebaseUserViaJson(data, app, true)
      return
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
      const newRoute = data.startsWith('/') ? data : '/' + data
      try {
        router.push(newRoute)
      } catch (e) {
        console.log(`Error navigating to link route ${newRoute}`, e)
      }
    }
  }

  useEffect(() => {
    document.addEventListener('message', handleNativeMessage)
    window.addEventListener('message', handleNativeMessage)
    return () => {
      document.removeEventListener('message', handleNativeMessage)
      window.removeEventListener('message', handleNativeMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div />
}

export const postMessageToNative = (type: string, data: any) => {
  const isNative = getIsNative()
  console.log('posting message to native, is native?', isNative)
  if (!isNative) return
  ;(window as any).ReactNativeWebView.postMessage(
    JSON.stringify({
      type,
      data,
    })
  )
}
