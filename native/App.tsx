import { useEffect, useRef, useState } from 'react'
import WebView from 'react-native-webview'
import { getAuth } from 'firebase/auth'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import 'expo-dev-client'
import { ENV, FIREBASE_CONFIG } from 'common/envs/constants'
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
import Clipboard from '@react-native-clipboard/clipboard'
// @ts-ignore
import * as LinkingManager from 'react-native/Libraries/Linking/NativeLinkingManager'
import * as Linking from 'expo-linking'
import { Subscription } from 'expo-modules-core'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { getApp, getApps, initializeApp } from 'firebase/app'
import * as Sentry from 'sentry-expo'
import { StatusBar } from 'expo-status-bar'
import { AuthModal } from 'components/auth-modal'

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
export const auth = getAuth(app)

// no other uri works for API requests due to CORS
// const uri = 'http://localhost:3000/'
const homeUri =
  ENV === 'DEV' ? 'https://dev.manifold.markets/' : 'https://manifold.markets/'

export default function App() {
  const [fbUser, setFbUser] = useState<string | null>()
  const [userId, setUserId] = useState<string | null>()

  const [isWebViewLoading, setIsWebViewLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const webview = useRef<WebView | undefined>()
  const [hasSetNativeFlag, setHasSetNativeFlag] = useState(false)
  const isIOS = Platform.OS === 'ios'
  const notificationListener = useRef<Subscription | undefined>()
  const responseListener = useRef<Subscription | undefined>()
  const url = Linking.useURL()
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
      webview.current?.postMessage(
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
      console.log('[handleBackButtonPress] Error : ', err)
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
          console.log('notification response', response)
          webview.current?.postMessage(
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
      console.log('[notification listener] Error : ', err)
    }

    return () => {
      console.log('removing notification listeners')
      notificationListener.current &&
        Notifications.removeNotificationSubscription(
          notificationListener.current
        )
      responseListener.current &&
        Notifications.removeNotificationSubscription(responseListener.current)
    }
  }, [])

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

  const handleMessageFromWebview = ({ nativeEvent }: any) => {
    const { data } = nativeEvent
    const { type, data: payload } = JSON.parse(data)
    console.log('Received nativeEvent: ', type)
    setHasSetNativeFlag(true)
    // Time to log in to firebase
    if (type === 'googleLoginClicked') {
      setShowAuthModal(true)
    } else if (type === 'tryToGetPushTokenWithoutPrompt') {
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
    } else if (type === 'copyToClipboard') {
      Clipboard.setString(payload)
    }
    // User needs to enable push notifications
    else if (type === 'promptEnablePushNotifications') {
      registerForPushNotificationsAsync().then((token) => {
        if (token)
          webview.current?.postMessage(
            JSON.stringify({
              type: 'pushToken',
              data: { token, userId },
            })
          )
      })
    } else if (type === 'signOut' && (fbUser || auth.currentUser)) {
      console.log('signOut called')
      auth.signOut()
      setFbUser(null)
      setUserId(null)
    }
    // Receiving cached firebase user from webview cache
    else if (type === 'users') {
      try {
        const fbUserAndPrivateUser = JSON.parse(payload)
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
        }
      } catch (e) {
        Sentry.Native.captureException(e, {
          extra: { message: 'error parsing nativeEvent.data' },
        })
        console.log('error parsing nativeEvent.data', e)
      }
    } else {
      console.log('Unhandled nativeEvent.data: ', data)
    }
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
          hidden={false}
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
          //@ts-ignore
          ref={webview}
          onError={(e) => {
            console.log('error in webview', e)
            Sentry.Native.captureException(e, {
              extra: { message: 'webview error' },
            })
          }}
          onTouchStart={() => {
            if (!hasSetNativeFlag && webview.current) {
              console.log('setting is native')
              webview.current.postMessage(
                JSON.stringify({
                  type: 'setIsNative',
                  data: {},
                })
              )
            }
          }}
          onNavigationStateChange={() => {
            if (!hasSetNativeFlag && webview.current) {
              console.log('setting is native')
              webview.current.postMessage(
                JSON.stringify({
                  type: 'setIsNative',
                  data: {},
                })
              )
            }
          }}
          onMessage={handleMessageFromWebview}
        />
        <AuthModal
          showModal={showAuthModal}
          setShowModal={setShowAuthModal}
          webview={webview}
          setFbUser={setFbUser}
          setUserId={setUserId}
        />
      </SafeAreaView>
    </>
  )
}
