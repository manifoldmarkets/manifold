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

export const NativeMessageListener = () => {
  const router = useRouter()

  const handleNativeMessage = async (e: any) => {
    let event
    try {
      event = JSON.parse(e.data)
    } catch (e) {
      console.log('error parsing native message', e)
      return
    }
    const eventType = event.type
    const eventData = event.data
    console.log('Received native event: ', event)
    if (eventType === 'nativeFbUser') {
      await setFirebaseUserViaJson(eventData, app)
      return
    } else if (eventType === 'pushNotificationPermissionStatus') {
      const { status, userId } = eventData
      await handlePushNotificationPermissionStatus(userId, status)
    } else if (eventType === 'pushToken') {
      const { token, userId } = eventData
      await setPushToken(userId, token)
    } else if (eventType === 'notification') {
      const notification = eventData as Notification
      const sourceUrl = getSourceUrl(notification)
      console.log('sourceUrl', sourceUrl)
      try {
        router.push(sourceUrl)
      } catch (e) {
        console.log(`Error navigating to notification route ${sourceUrl}`, e)
      }
    } else if (eventType === 'link') {
      console.log('link', eventData)
      const newRoute = eventData.startsWith('/') ? eventData : '/' + eventData
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

// TODO: use this method instead of call (window as any) all the time
export const postMessageToNative = (type: string, data: any) => {
  ;(window as any).ReactNativeWebView.postMessage(
    JSON.stringify({
      type,
      data,
    })
  )
}
