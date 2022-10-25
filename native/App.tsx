import { useEffect, useRef, useState } from 'react'
import * as Google from 'expo-auth-session/providers/google'
import WebView from 'react-native-webview'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  User,
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
import {
  Platform,
  BackHandler,
  NativeEventEmitter,
  View,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar as RNStatusBar,
} from 'react-native'
import * as LinkingManager from 'react-native/Libraries/Linking/NativeLinkingManager'
import * as Linking from 'expo-linking'
import { Subscription } from 'expo-modules-core'
import { TEN_YEARS_SECS } from 'common/envs/constants'
import { PrivateUser } from 'common/user'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { removeUndefinedProps } from 'common/util/object'
import * as Sentry from 'sentry-expo'
import { StatusBar } from 'expo-status-bar'

console.log('using', ENV, 'env')
console.log(
  'env not switching? run `npx expo start --clear` and then try again'
)

// Initialization
Sentry.init({
  dsn: 'https://2353d2023dad4bc192d293c8ce13b9a1@o4504040581496832.ingest.sentry.io/4504040585494528',
  enableInExpoDevelopment: true,
  debug: true, // If `true`, Sentry will try to print out useful debugging information if something goes wrong with sending the event. Set it to `false` in production
})
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})
const isExpoClient =
  Constants.ExecutionEnvironment === ExecutionEnvironment.StoreClient

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
const auth = getAuth(app)

// no other uri works for API requests due to CORS
// const uri = 'http://localhost:3000/'
const homeUri =
  ENV === 'DEV'
    ? 'https://dev-git-native-main-rebase-mantic.vercel.app/'
    : 'https://prod-git-native-main-rebase-mantic.vercel.app/'

export default function App() {
  const [fbUser, setFbUser] = useState<string | null>()
  const [_, response, promptAsync] = Google.useIdTokenAuthRequest(
    ENV_CONFIG.expoConfig
  )
  const [isWebViewLoading, setIsWebViewLoading] = useState(true)
  const webview = useRef<WebView>()
  const [hasInjectedVariable, setHasInjectedVariable] = useState(false)
  const isIOS = Platform.OS === 'ios'
  const useWebKit = isIOS
  const notificationListener = useRef<Subscription | undefined>()
  const responseListener = useRef<Subscription | undefined>()
  const url = Linking.useURL()
  // TODO: untested on ios
  const eventEmitter = new NativeEventEmitter(
    Platform.OS === 'ios' ? LinkingManager.default : null
  )

  useEffect(() => {
    if (!url) return

    const { hostname, path, queryParams } = Linking.parse(url)
    if (path !== 'blank' && hostname) {
      console.log(
        `Linked to app with hostname: ${hostname}, path: ${path} and data: ${JSON.stringify(
          queryParams
        )}`
      )
      webview.current.postMessage(
        JSON.stringify({
          type: 'link',
          data: path,
        })
      )
      // If we don't clear the url, we won't reopen previously opened links
      const clearUrlCacheEvent = {
        hostname: 'manifold.markets',
        url: 'blank',
      }
      eventEmitter.emit('url', clearUrlCacheEvent)
    }
  }, [url])

  const handleBackButtonPress = () => {
    try {
      webview.current?.goBack()
      return true
    } catch (err) {
      Sentry.Native.captureException(err, {
        extra: { message: 'back button press' },
      })
      console.log('[handleBackButtonPress] Error : ', err.message)
      return false
    }
  }

  useEffect(() => {
    BackHandler.addEventListener('hardwareBackPress', handleBackButtonPress)
    return () => {
      BackHandler.removeEventListener(
        'hardwareBackPress',
        handleBackButtonPress
      )
    }
  }, [])

  useEffect(() => {
    try {
      // This listener is fired whenever a notification is received while the app is foregrounded
      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          console.log('notification received', notification)
        })

      // This listener is fired whenever a user taps on or interacts with a notification (works when app is foregrounded, backgrounded, or killed)
      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          webview.current.postMessage(
            JSON.stringify({
              type: 'notification',
              data: response.notification.request.content.data,
            })
          )
        })
    } catch (err) {
      Sentry.Native.captureException(err, {
        extra: { message: 'notification listener' },
      })
      console.log('[notification listener] Error : ', err.message)
    }

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current)
      Notifications.removeNotificationSubscription(responseListener.current)
    }
  }, [])

  // We can't just log in to google within the webview: see https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html#instructions-ios
  useEffect(() => {
    try {
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
    } catch (err) {
      Sentry.Native.captureException(err, {
        extra: { message: 'google sign in' },
      })
      console.log('[google sign in] Error : ', err.message)
    }
  }, [response])

  useEffect(() => {
    try {
      if (fbUser && !isExpoClient) {
        console.log('Setting cookie')
        CookieManager.set(
          homeUri,
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
    } catch (err) {
      Sentry.Native.captureException(err, { extra: { message: 'set cookie' } })
      console.log('[setCookie] Error : ', err.message)
    }
  }, [fbUser])

  const setPushToken = async (userId: string, pushToken: string) => {
    console.log('setting push token', pushToken, 'for user', userId)
    if (!userId || !pushToken) return
    try {
      const firestore = getFirestore(app)
      const userDoc = doc(firestore, 'private-users', userId)
      const privateUserDoc = await getDoc(userDoc)
      if (!privateUserDoc.exists()) {
        console.log('no private user found')
        return
      }
      const privateUser = privateUserDoc.data() as PrivateUser
      const prefs = privateUser.notificationPreferences
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
      Sentry.Native.captureException(e, {
        extra: { message: 'error setting user push token' },
      })
      console.error('error setting user push token', e)
    }
  }

  const registerForPushNotificationsAsync = async () => {
    if (!Device.isDevice) {
      alert('Must use physical device for Push Notifications')
      return null
    }
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        })
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync()
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
      const appConfig = require('app.config')
      const projectId = appConfig.extra.eas.projectId
      console.log('project id', projectId)
      const token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data
      console.log(token)
      return token
    } catch (e) {
      Sentry.Native.captureException(e, {
        extra: { message: 'error registering for push notifications' },
      })
      console.error('error registering for push notifications', e)
      return null
    }
  }

  const handleMessageFromWebview = ({ nativeEvent }) => {
    console.log('Received nativeEvent.data: ', nativeEvent.data.slice(0, 20))
    // Time to log in to firebase
    if (nativeEvent.data === 'googleLoginClicked') {
      promptAsync()
      return
    }
    // User needs to enable push notifications
    else if (nativeEvent.data === 'promptEnablePushNotifications' && fbUser) {
      const user = JSON.parse(fbUser) as User
      if (user.uid) {
        registerForPushNotificationsAsync().then((token) => {
          token && setPushToken(user.uid, token)
        })
      }
      return
    } else if (nativeEvent.data === 'signOut' && (fbUser || auth.currentUser)) {
      console.log('signOut called')
      auth.signOut()
      setFbUser(null)
      !isExpoClient && CookieManager.clearAll(useWebKit)
      return
    }
    if (
      nativeEvent.data.includes('fbUser') ||
      nativeEvent.data.includes('uid')
    ) {
      try {
        const fbUserAndPrivateUser = JSON.parse(nativeEvent.data)
        // Passing us a signed-in user object
        if (fbUserAndPrivateUser && fbUserAndPrivateUser.fbUser) {
          console.log('Signing in fb user from webview cache')
          setFirebaseUserViaJson(fbUserAndPrivateUser.fbUser, app).then(
            (userResult) =>
              userResult && setFbUser(JSON.stringify(userResult.toJSON()))
          )
          return
        }
      } catch (e) {
        Sentry.Native.captureException(e, {
          extra: { message: 'error parsing nativeEvent.data' },
        })
        console.log('error parsing nativeEvent.data', e)
      }
    }
    console.log('Unhandled nativeEvent.data: ', nativeEvent.data)
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    horizontal: {
      height: '100%',
      justifyContent: 'space-around',
      padding: 10,
    },
    webView: {
      display: isWebViewLoading ? 'none' : 'flex',
      overflow: 'hidden',
      marginTop: !isIOS ? RNStatusBar.currentHeight : 0,
      marginBottom: !isIOS ? 10 : 0,
    },
  })

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        animated={true}
        backgroundColor="white"
        style={'dark'}
        hideTransitionAnimation={'none'}
        hidden={false}
      />
      {isWebViewLoading && (
        <View style={[styles.horizontal]}>
          <ActivityIndicator size={'large'} color={'blue'} />
        </View>
      )}
      <WebView
        style={styles.webView}
        allowsBackForwardNavigationGestures={true}
        onLoadEnd={() => isWebViewLoading && setIsWebViewLoading(false)}
        sharedCookiesEnabled={true}
        source={{ uri: homeUri }}
        ref={webview}
        onMessage={handleMessageFromWebview}
        onNavigationStateChange={async (navState) => {
          if (!navState.loading && !hasInjectedVariable && webview.current) {
            webview.current.injectJavaScript('window.isNative = true')
            setHasInjectedVariable(true)
          }
        }}
      />
    </SafeAreaView>
  )
}
