import { app } from 'web/lib/firebase/init'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { useEffect } from 'react'
import Router from 'next/router'
import { Notification } from 'common/notification'
import { getSourceUrl } from 'web/lib/firebase/notifications'

export const NativeMessageListener = () => {
  const handleNativeMessage = (e: any) => {
    try {
      const event = JSON.parse(e.data)
      const data = event.data
      console.log('Received native event: ', event)
      if (event.type === 'nativeFbUser') {
        setFirebaseUserViaJson(data, app)
      } else if (event.type === 'notification') {
        const notification = data as Notification
        try {
          const sourceUrl = getSourceUrl(notification)
          console.log('sourceUrl', sourceUrl)
          Router.push(sourceUrl)
        } catch (e) {
          console.log('Error navigating to notification source', e)
        }
      }
    } catch (e) {
      console.log('error parsing native message', e)
      return
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
