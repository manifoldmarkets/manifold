import { useEffect, useRef, useState } from 'react'
import * as Google from 'expo-auth-session/providers/google'
import WebView from 'react-native-webview'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import 'expo-dev-client'
import CookieManager from '@react-native-cookies/cookies'
import {
  AUTH_COOKIE_NAME,
  ENV,
  ENV_CONFIG,
  FIREBASE_CONFIG,
} from 'common/envs/constants'
import {
  doc,
  getFirestore,
  getDoc,
  updateDoc,
  deleteField,
} from 'firebase/firestore'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { Notification } from 'expo-notifications'
import { Subscription } from 'expo-modules-core'
import { TEN_YEARS_SECS } from 'common/envs/constants'
import { PrivateUser } from 'common/user'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { removeUndefinedProps } from 'common/util/object'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})
const isExpoClient =
  Constants.ExecutionEnvironment === ExecutionEnvironment.StoreClient

// Initialize Firebase
console.log('using', ENV, 'env')
console.log(
  'env not switching? run `npx expo start --clear` and then try again'
)
const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
const firestore = getFirestore(app)
const auth = getAuth(app)

// no other uri works for API requests due to CORS
// const uri = 'http://localhost:3000/'
const uri =
  ENV === 'DEV'
    ? 'https://dev-git-native-main-rebase-mantic.vercel.app/'
    : 'https://prod-git-native-main-rebase-mantic.vercel.app/'

export default function App() {
  const [fbUser, setFbUser] = useState<string | null>()
  const [privateUser, setPrivateUser] = useState<string | null>()
  const [_, response, promptAsync] = Google.useIdTokenAuthRequest(
    ENV_CONFIG.expoConfig
  )
  const webview = useRef<WebView>()
  const [hasInjectedVariable, setHasInjectedVariable] = useState(false)
  const isIOS = Platform.OS === 'ios'
  const useWebKit = isIOS
  const [notification, setNotification] = useState<Notification | false>(false)
  const notificationListener = useRef<Subscription | undefined>()
  const responseListener = useRef<Subscription | undefined>()

  useEffect(() => {
    // This listener is fired whenever a notification is received while the app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        // TODO: pass this to the webview so we can navigate to the correct page
        setNotification(notification)
      })

    // This listener is fired whenever a user taps on or interacts with a notification (works when app is foregrounded, backgrounded, or killed)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log(response)
      })

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current)
      Notifications.removeNotificationSubscription(responseListener.current)
    }
  }, [])

  // We can't just log in to google within the webview: see https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html#instructions-ios
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params
      const credential = GoogleAuthProvider.credential(id_token)
      signInWithCredential(auth, credential).then((result) => {
        const fbUser = result.user.toJSON()
        if (webview.current) {
          webview.current.postMessage(
            JSON.stringify({ type: 'nativeFbUser', data: fbUser })
          )
        }
      })
    }
  }, [response])

  useEffect(() => {
    console.log('is expo client:', isExpoClient)
    if (fbUser) {
      !isExpoClient &&
        CookieManager.set(
          uri,
          {
            name: AUTH_COOKIE_NAME,
            value: encodeURIComponent(fbUser),
            path: '/',
            expires: new Date(TEN_YEARS_SECS).toISOString(),
            secure: true,
          },
          useWebKit
        )
    }
  }, [])

  const setPushToken = async (userId: string, pushToken: string) => {
    console.log('setting push token', pushToken, 'for user', userId)
    if (!userId || !pushToken) return
    try {
      const userDoc = doc(firestore, 'private-users', userId)
      const privateUser = (await getDoc(userDoc)).data() as PrivateUser
      const prefs = privateUser.notificationPreferences
      // TODO: check if this works
      prefs.opt_out_all = prefs.opt_out_all.filter((p) => p !== 'mobile')
      privateUser.notificationPreferences = prefs
      await updateDoc(
        userDoc,
        removeUndefinedProps({
          ...privateUser,
          pushToken,
          rejectedPushNotificationsOn: privateUser.rejectedPushNotificationsOn
            ? deleteField()
            : undefined,
        })
      )
    } catch (e) {
      console.error('error setting user push token', e)
    }
  }

  const registerForPushNotificationsAsync = async () => {
    if (!Device.isDevice) {
      alert('Must use physical device for Push Notifications')
      return null
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      })
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus
    console.log('existing status of push notifications', existingStatus)
    if (existingStatus !== 'granted') {
      console.log('requesting permission')
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') {
      return
    }
    const appConfig = require('./app.json')
    const projectId = appConfig?.expo?.extra?.eas?.projectId
    console.log('project id', projectId)
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data
    console.log(token)
    return token
  }

  const handleMessageFromWebview = ({ nativeEvent }) => {
    console.log('Received nativeEvent.data: ', nativeEvent.data.slice(0, 50))
    // Time to log in to firebase
    if (nativeEvent.data === 'googleLoginClicked') {
      promptAsync()
      return
    }
    // User needs to enable push notifications
    else if (
      nativeEvent.data === 'promptEnablePushNotifications' &&
      privateUser
    ) {
      const privateUserObj = JSON.parse(privateUser) as PrivateUser
      if (!privateUserObj?.pushToken && privateUserObj.id) {
        registerForPushNotificationsAsync().then((token) => {
          token && setPushToken(privateUserObj.id, token)
        })
      }
      return
    } else if (nativeEvent.data === 'signOut') {
      console.log('signOut called')
      auth.signOut()
      setFbUser(null)
      setPrivateUser(null)
      !isExpoClient && CookieManager.clearAll(useWebKit)
      return
    }
    try {
      const fbUserAndPrivateUser = JSON.parse(nativeEvent.data)
      // Passing us a signed-in user object
      if (
        fbUserAndPrivateUser &&
        fbUserAndPrivateUser.fbUser &&
        fbUserAndPrivateUser.privateUser
      ) {
        console.log('Signing in fb user from webview cache')
        setFirebaseUserViaJson(fbUserAndPrivateUser.fbUser, app)
        setFbUser(JSON.stringify(fbUserAndPrivateUser.fbUser))
        setPrivateUser(JSON.stringify(fbUserAndPrivateUser.privateUser))
        return
      }
    } catch (e) {
      console.log('Unhandled nativeEvent.data: ', nativeEvent.data)
    }
  }

  return (
    <>
      <WebView
        style={{ marginTop: isIOS ? 30 : 0, marginBottom: isIOS ? 15 : 0 }}
        allowsBackForwardNavigationGestures={true}
        sharedCookiesEnabled={true}
        source={{ uri }}
        ref={webview}
        onMessage={handleMessageFromWebview}
        onNavigationStateChange={async (navState) => {
          if (!navState.loading && !hasInjectedVariable && webview.current) {
            webview.current.injectJavaScript('window.isNative = true')
            setHasInjectedVariable(true)
          }
        }}
      />
    </>
  )
}
