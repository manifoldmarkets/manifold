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
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import {
  Platform,
  BackHandler,
  NativeEventEmitter,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar as RNStatusBar,
  Image,
  Dimensions,
} from 'react-native'
import * as LinkingManager from 'react-native/Libraries/Linking/NativeLinkingManager'
import * as Linking from 'expo-linking'
import { Subscription } from 'expo-modules-core'
import { TEN_YEARS_SECS } from 'common/envs/constants'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { getApp, getApps, initializeApp } from 'firebase/app'
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
    : // : 'https://prod-git-native-main-rebase-mantic.vercel.app/'
      'https://019b-191-96-67-98.ngrok.io'

export default function App() {
  const [fbUser, setFbUser] = useState<string | null>()
  const [userId, setUserId] = useState<string | null>()
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

  const getExistingPushNotificationStatus = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      })
    }

    const { status } = await Notifications.getPermissionsAsync()
    console.log('getExistingPushNotificationStatus', status)
    return status
  }

  const getPushToken = async () => {
    const appConfig = require('./app.json')
    const projectId = appConfig.expo.extra.eas.projectId
    console.log('project id', projectId)
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data
    console.log(token)
    return token
  }

  const registerForPushNotificationsAsync = async () => {
    if (!Device.isDevice) return null

    try {
      const existingStatus = await getExistingPushNotificationStatus()
      let finalStatus = existingStatus
      console.log('existing status of push notifications', existingStatus)
      if (existingStatus !== 'granted') {
        console.log('requesting permission')
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }
      if (finalStatus !== 'granted') {
        webview.current?.postMessage(
          JSON.stringify({
            type: 'pushNotificationPermissionStatus',
            data: { status: finalStatus, userId },
          })
        )
        return null
      }
      return await getPushToken()
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
    } else if (nativeEvent.data === 'tryToGetPushTokenWithoutPrompt') {
      getExistingPushNotificationStatus().then(async (status) => {
        if (status === 'granted') {
          const token = await getPushToken()
          if (!webview.current) return
          if (token)
            webview.current.postMessage(
              JSON.stringify({
                type: 'pushToken',
                data: { token, userId },
              })
            )
        } else
          webview.current?.postMessage(
            JSON.stringify({
              type: 'pushNotificationPermissionStatus',
              data: { status, userId },
            })
          )
      })
      return
    }
    // User needs to enable push notifications
    else if (nativeEvent.data === 'promptEnablePushNotifications') {
      registerForPushNotificationsAsync().then((token) => {
        if (token)
          webview.current?.postMessage(
            JSON.stringify({
              type: 'pushToken',
              data: { token, userId },
            })
          )
      })
      return
    } else if (nativeEvent.data === 'signOut' && (fbUser || auth.currentUser)) {
      console.log('signOut called')
      auth.signOut()
      setFbUser(null)
      setUserId(null)
      !isExpoClient && CookieManager.clearAll(useWebKit)
      return
    }
    // Receiving cached firebase user from webview cache
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
            (userResult) => {
              if (userResult) {
                setFbUser(JSON.stringify(userResult.toJSON()))
                setUserId(userResult.uid)
              }
            }
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

  const width = Dimensions.get('window').width //full width
  const height = Dimensions.get('window').height //full height
  const styles = StyleSheet.create({
    container: {
      display: isWebViewLoading ? 'none' : 'flex',
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
    image: {
      height,
      width,
      flex: 1,
      justifyContent: 'center',
      resizeMode: 'cover',
    },
    activityIndicator: {
      position: 'absolute',
      left: width / 2 - 20,
      bottom: 100,
    },
  })

  return (
    <>
      {isWebViewLoading && (
        <>
          <Image style={styles.image} source={require('./assets/splash.png')} />
          <ActivityIndicator
            style={styles.activityIndicator}
            size={'large'}
            color={'white'}
          />
        </>
      )}
      <SafeAreaView style={styles.container}>
        <StatusBar
          animated={true}
          backgroundColor="white"
          style={'dark'}
          hideTransitionAnimation={'none'}
          hidden={isWebViewLoading}
        />
        <WebView
          style={styles.webView}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          overScrollMode={'never'}
          decelerationRate={'normal'}
          allowsBackForwardNavigationGestures={true}
          onLoadEnd={() => isWebViewLoading && setIsWebViewLoading(false)}
          sharedCookiesEnabled={true}
          source={{ uri: homeUri }}
          ref={webview}
          onError={(e) => {
            console.log('error in webview', e)
            Sentry.Native.captureException(e, {
              extra: { message: 'webview error' },
            })
          }}
          onMessage={handleMessageFromWebview}
          onNavigationStateChange={async (navState) => {
            if (!navState.loading && !hasInjectedVariable && webview.current) {
              webview.current.injectJavaScript('window.isNative = true')
              setHasInjectedVariable(true)
            }
          }}
        />
      </SafeAreaView>
    </>
  )
}
