import { app } from 'web/lib/firebase/init'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { useEffect } from 'react'
import { Notification } from 'common/notification'
import { getSourceUrl } from 'web/lib/firebase/notifications'
import { useRouter } from 'next/router'

export const NativeMessageListener = () => {
  const router = useRouter()

  const handleNativeMessage = (e: any) => {
    let event
    try {
      event = JSON.parse(e.data)
    } catch (e) {
      console.log('error parsing native message', e)
      return
    }
    const eventType = event.type
    const eventData = event.data
    let newRoute = ''
    console.log('Received native event: ', event)
    if (eventType === 'nativeFbUser') {
      setFirebaseUserViaJson(eventData, app)
    } else if (eventType === 'notification') {
      const notification = eventData as Notification
      const sourceUrl = getSourceUrl(notification)
      console.log('sourceUrl', sourceUrl)
      newRoute = sourceUrl
    } else if (eventType === 'link') {
      console.log('link', eventData)
      newRoute = eventData.startsWith('/') ? eventData : '/' + eventData
    }
    try {
      router.push(newRoute)
    } catch (e) {
      console.log(`Error navigating to route ${newRoute}`, e)
    }
  }

  useEffect(() => {
    document.addEventListener('message', handleNativeMessage)
    window.addEventListener('message', handleNativeMessage)
    return () => {
      document.removeEventListener('message', handleNativeMessage)
      window.removeEventListener('message', handleNativeMessage)
    }
  }, [])

  return <div />
}
