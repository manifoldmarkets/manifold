import { app } from 'web/lib/firebase/init'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { getSourceUrl, Notification } from 'common/notification'
import {
  handlePushNotificationPermissionStatus,
  setPushToken,
} from 'web/lib/supabase/notifications'
import { useRouter } from 'next/router'
import {
  setInstalledAppPlatform,
  setIsNativeOld,
} from 'web/lib/native/is-native'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { createContext, useContext, useEffect } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { useEvent } from 'client-common/hooks/use-event'
import { auth } from 'web/lib/firebase/users'
import { User as FirebaseUser } from 'firebase/auth'
import { postMessageToNative } from 'web/lib/native/post-message'
import { MesageTypeMap, nativeToWebMessageType } from 'common/native-message'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

type NativeContextType = {
  isNative: boolean
  platform: string
  version: string
  isIOS: boolean
}

export const NativeContext = createContext<NativeContextType | undefined>(
  undefined
)

export const NativeMessageProvider = (props: { children: React.ReactNode }) => {
  const { children } = props
  const router = useRouter()
  const privateUser = usePrivateUser()
  const [isNative, setIsNative] = usePersistentLocalState(false, 'is-native-v2')
  const [platform, setPlatform] = usePersistentLocalState(
    '',
    'native-platform-v2'
  )
  const [version, setVersion] = usePersistentLocalState('', 'native-version')

  useEffect(() => {
    postMessageToNative('startedListening', {})
  }, [])

  useEffect(() => {
    postMessageToNative('versionRequested', {})
  }, [])

  useNativeMessages(['version'], (type, data) => {
    const { version } = data
    console.log('Native version', version)
    if (version) {
      setVersion(version)
    }
  })

  useEffect(() => {
    const { nativePlatform } = router.query
    if (nativePlatform !== undefined) {
      const platform = nativePlatform as string
      setIsNativeOld(true, platform)
      setIsNative(true)
      setPlatform(platform)
      if (privateUser) setInstalledAppPlatform(privateUser, platform)
    }
  }, [privateUser, router.query])

  const handleNativeMessage = useEvent(
    async (type: nativeToWebMessageType, data: MesageTypeMap[typeof type]) => {
      if (type === 'nativeFbUser') {
        console.log('received nativeFbUser')
        const user = data as FirebaseUser
        if (auth.currentUser?.email !== user.email)
          await setFirebaseUserViaJson(user, app, true)
      } else if (type === 'pushNotificationPermissionStatus') {
        const { status } =
          data as MesageTypeMap['pushNotificationPermissionStatus']
        await handlePushNotificationPermissionStatus(status)
      } else if (type === 'pushToken') {
        const { token } = data as MesageTypeMap['pushToken']
        if (token !== privateUser?.pushToken) {
          await setPushToken(token)
        }
      } else if (type === 'notification') {
        const notification = data as Notification
        // TODO: mark the notification as seen
        const sourceUrl = getSourceUrl(notification)
        console.log('sourceUrl', sourceUrl)
        try {
          router.push(sourceUrl)
        } catch (e) {
          console.log(`Error navigating to notification route ${sourceUrl}`, e)
        }
      } else if (type === 'link') {
        const { url } = data as MesageTypeMap['link']
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
    }
  )

  useNativeMessages(
    [
      'nativeFbUser',
      'pushNotificationPermissionStatus',
      'pushToken',
      'notification',
      'link',
    ],
    handleNativeMessage
  )

  const isIOS = platform === 'ios' && isNative
  return (
    <NativeContext.Provider value={{ isNative, platform, version, isIOS }}>
      {children}
    </NativeContext.Provider>
  )
}

export const useNativeInfo = () => {
  const context = useContext(NativeContext)
  if (context === undefined) {
    throw new Error('useNativeInfo must be used within a NativeMessageListener')
  }
  return context
}

export const useIsNativeIOS = () => {
  const { isNative, platform } = useNativeInfo()
  return isNative && platform === 'ios'
}
