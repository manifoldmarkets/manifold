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
import { createContext, useContext, useEffect, useRef } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { useEvent } from 'client-common/hooks/use-event'
import { auth } from 'web/lib/firebase/users'
import { User as FirebaseUser } from 'firebase/auth'
import { postMessageToNative } from 'web/lib/native/post-message'
import {
  IS_NATIVE_V2_KEY,
  MesageTypeMap,
  NATIVE_PLATFORM_V2_KEY,
  NATIVE_VERSION_KEY,
  nativeToWebMessageType,
} from 'common/native-message'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { useNativeQuestSync } from 'web/hooks/use-native-quest-sync'

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
  const [isNative, setIsNative] = usePersistentLocalState(
    false,
    IS_NATIVE_V2_KEY
  )
  const [platform, setPlatform] = usePersistentLocalState(
    '',
    NATIVE_PLATFORM_V2_KEY
  )
  const [version, setVersion] = usePersistentLocalState('', NATIVE_VERSION_KEY)

  // The native app re-sends 'nativeFbUser' on a retry schedule, and can send
  // different users in quick succession (an account switch). setFirebaseUserViaJson
  // awaits a token refresh before it commits, so running two concurrently is a
  // race: the slower one can commit last and win, restoring the wrong account.
  // Serialize every application onto one chain so they commit in arrival order
  // (the last-arrived user wins) and same-user retries collapse to a no-op once
  // that user is current.
  const fbUserHandoffChain = useRef<Promise<unknown>>(Promise.resolve())

  // Push quest completion to the streak widget (native only, once per session).
  useNativeQuestSync(privateUser?.id, isNative)

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
        // Re-check currentUser at execution time (not now): by the time this link
        // runs, an earlier one may have already made this user current, so the
        // retry collapses to a no-op.
        const apply = async () => {
          if (auth.currentUser?.email === user.email) return
          await setFirebaseUserViaJson(user, app, true)
        }
        const next = fbUserHandoffChain.current.then(apply, apply)
        fbUserHandoffChain.current = next
        await next
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
      } else if (type === 'hasReviewAction') {
        const { hasAction, isAvailable, reason } =
          data as MesageTypeMap['hasReviewAction']
        if (hasAction && isAvailable) {
          console.log('Store review is available, requesting review.')
          track('review_prompt_requested', { reason })
          postMessageToNative('storeReviewRequested', {})
          // Update the user's last review time optimistically. Apple's
          // requestReview() returns void and may silently no-op (3-prompts/year
          // cap), so we can't know whether the modal was actually shown — we
          // bump the timestamp regardless so cooldown logic stays predictable.
          api('me/private/update', { lastAppReviewTime: Date.now() }).catch(
            (e) => {
              console.error('Failed to update lastAppReviewTime', e)
            }
          )
        } else {
          console.log('Store review not available or action already taken.', {
            hasAction,
            isAvailable,
          })
          track('review_prompt_skipped', { reason, hasAction, isAvailable })
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
      'hasReviewAction',
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
