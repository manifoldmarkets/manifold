import React, { useEffect, useRef, useState } from 'react'
import WebView from 'react-native-webview'
import { getAuth } from 'firebase/auth'
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
  View,
  Text,
  Pressable,
  Share,
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
import { Feather, AntDesign } from '@expo/vector-icons'
import { IAP } from './components/iap'

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
const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
export const auth = getAuth(app)

// no other uri works for API requests due to CORS
// const uri = 'http://localhost:3000/'
const homeUri =
  ENV === 'DEV'
    ? 'https://ddb7-181-41-206-237.ngrok.io'
    : 'https://manifold.markets/'

const App = () => {
  // Init
  const [hasWebViewLoaded, setHasWebViewLoaded] = useState(true)
  const [hasSetNativeFlag, setHasSetNativeFlag] = useState(false)
  const isIOS = Platform.OS === 'ios'
  const webview = useRef<WebView | undefined>()
  const notificationListener = useRef<Subscription | undefined>()
  const responseListener = useRef<Subscription | undefined>()

  // Auth
  const [fbUser, setFbUser] = useState<string | null>()
  const [userId, setUserId] = useState<string | null>()
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Url mangement
  const [currentHostStatus, setCurrentHostStatus] = useState<{
    previousHomeUrl: string
    previousUrl: string
    url: string
    loading: boolean
  }>({
    previousHomeUrl: homeUri,
    previousUrl: homeUri,
    url: homeUri,
    loading: true,
  })
  const [urlToLoad, setUrlToLoad] = useState<string>(homeUri)
  const isVisitingOtherSite =
    !currentHostStatus.url.startsWith(homeUri) ||
    (currentHostStatus.loading &&
      !currentHostStatus.previousUrl.startsWith(homeUri))
  const linkedUrl = Linking.useURL()
  const eventEmitter = new NativeEventEmitter(
    Platform.OS === 'ios' ? LinkingManager.default : null
  )

  const [checkoutAmount, setCheckoutAmount] = useState<number | null>(null)

  // Initialize listeners
  useEffect(() => {
    try {
      BackHandler.addEventListener('hardwareBackPress', handleBackButtonPress)
      // This listener is fired whenever a notification is received while the app is foregrounded
      notificationListener.current =
        Notifications.addNotificationReceivedListener((notification) => {
          console.log('notification received', notification)
        })

      // This listener is fired whenever a user taps on or interacts with a notification (works when app is foregrounded, backgrounded, or killed)
      responseListener.current =
        Notifications.addNotificationResponseReceivedListener((response) => {
          console.log('notification response', response)
          communicateWithWebview(
            'notification',
            response.notification.request.content.data
          )
        })
    } catch (err) {
      Sentry.Native.captureException(err, {
        extra: { message: 'notification & back listener' },
      })
      console.log('[notification & back listener] Error : ', err)
    }

    return () => {
      console.log('removing notification & back listeners')
      notificationListener.current &&
        Notifications.removeNotificationSubscription(
          notificationListener.current
        )
      responseListener.current &&
        Notifications.removeNotificationSubscription(responseListener.current)
      BackHandler.removeEventListener(
        'hardwareBackPress',
        handleBackButtonPress
      )
    }
  }, [])

  useEffect(() => {
    if (!linkedUrl) return

    const { hostname, path, queryParams } = Linking.parse(linkedUrl)
    if (path !== 'blank' && hostname) {
      console.log(
        `Linked to app with hostname: ${hostname}, path: ${path} and data: ${JSON.stringify(
          queryParams
        )}`
      )
      communicateWithWebview('link', path ? path : '/')
      // If we don't clear the url, we won't reopen previously opened links
      const clearUrlCacheEvent = {
        hostname: 'manifold.markets',
        url: 'blank',
      }
      eventEmitter.emit('url', clearUrlCacheEvent)
    }
  }, [linkedUrl])

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
        communicateWithWebview('pushNotificationPermissionStatus', {
          status: finalStatus,
          userId,
        })
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
    if (type === 'checkout') {
      setCheckoutAmount(payload.amount)
    } else if (type === 'loginClicked') {
      setShowAuthModal(true)
    } else if (type === 'tryToGetPushTokenWithoutPrompt') {
      getExistingPushNotificationStatus().then(async (status) => {
        if (status === 'granted') {
          const token = await getPushToken()
          if (!webview.current) return
          if (token) communicateWithWebview('pushToken', { token, userId })
        } else
          communicateWithWebview('pushNotificationPermissionStatus', {
            status,
            userId,
          })
      })
    } else if (type === 'copyToClipboard') {
      Clipboard.setString(payload)
    }
    // User needs to enable push notifications
    else if (type === 'promptEnablePushNotifications') {
      registerForPushNotificationsAsync().then((token) => {
        if (token) communicateWithWebview('pushToken', { token, userId })
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

  const tellWebviewToSetNativeFlag = () => {
    if (hasSetNativeFlag) return
    communicateWithWebview('setIsNative', { platform: Platform.OS })
  }

  const communicateWithWebview = (type: string, data: object | string) => {
    webview.current?.postMessage(
      JSON.stringify({
        type,
        data,
      })
    )
  }

  const width = Dimensions.get('window').width //full width
  const height = Dimensions.get('window').height //full height
  const styles = StyleSheet.create({
    container: {
      display: hasWebViewLoaded ? 'none' : 'flex',
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
      display: hasWebViewLoaded ? 'none' : 'flex',
      overflow: 'hidden',
      marginTop:
        (!isIOS ? RNStatusBar.currentHeight ?? 0 : 0) +
        (isVisitingOtherSite ? 40 : 0),
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
    otherSiteToolbar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 90,
      backgroundColor: 'lightgray',
      zIndex: 100,
      display: isVisitingOtherSite ? 'flex' : 'none',
    },
    row: {
      flexDirection: 'row',
      flex: 1,
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 15,
      marginHorizontal: 20,
    },
    toolBarText: {
      fontSize: 20,
      width: 50,
    },
    toolBarIcon: {
      width: 50,
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
    },
  })

  return (
    <>
      <IAP
        checkoutAmount={checkoutAmount}
        setCheckoutAmount={setCheckoutAmount}
      />
      {hasWebViewLoaded && (
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
        <View style={styles.otherSiteToolbar}>
          <View style={styles.row}>
            <Pressable
              style={[styles.toolBarIcon, { justifyContent: 'flex-start' }]}
              onPress={() => {
                const { previousHomeUrl } = currentHostStatus
                // In order to make the webview load a new url manually it has to be different from the previous one
                const back = !previousHomeUrl.includes('?')
                  ? `${previousHomeUrl}?ignoreThisQuery=true`
                  : `${previousHomeUrl}&ignoreThisQuery=true`
                console.log('back to', back)
                setUrlToLoad(back)
              }}
            >
              <Text style={styles.toolBarText}>Done</Text>
            </Pressable>
            <Pressable
              style={styles.toolBarIcon}
              onPress={async () => {
                await Share.share({
                  message: currentHostStatus.url,
                })
              }}
            >
              <Feather name="share" size={24} color="black" />
            </Pressable>
            <Pressable
              style={[styles.toolBarIcon, { justifyContent: 'flex-end' }]}
              onPress={async () => {
                if (currentHostStatus.loading) {
                  webview.current?.stopLoading()
                  setCurrentHostStatus({
                    ...currentHostStatus,
                    loading: false,
                  })
                } else {
                  webview.current?.reload()
                  setCurrentHostStatus({
                    ...currentHostStatus,
                    loading: true,
                  })
                }
              }}
            >
              {currentHostStatus.loading ? (
                <Feather name="x" size={24} color="black" />
              ) : (
                <AntDesign name="reload1" size={24} color="black" />
              )}
            </Pressable>
          </View>
        </View>
        <WebView
          style={styles.webView}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          overScrollMode={'never'}
          decelerationRate={'normal'}
          allowsBackForwardNavigationGestures={true}
          onLoadEnd={() => {
            console.log('onLoadEnd')
            if (hasWebViewLoaded) setHasWebViewLoaded(false)
            setCurrentHostStatus({ ...currentHostStatus, loading: false })
          }}
          sharedCookiesEnabled={true}
          source={{ uri: urlToLoad }}
          //@ts-ignore
          ref={webview}
          onError={(e) => {
            console.log('error in webview', e)
            Sentry.Native.captureException(e, {
              extra: { message: 'webview error' },
            })
          }}
          onTouchStart={() => {
            tellWebviewToSetNativeFlag()
          }}
          onLoadStart={() => {
            setCurrentHostStatus({ ...currentHostStatus, loading: true })
          }}
          onNavigationStateChange={(navState) => {
            const { url, loading } = navState
            console.log('setting new nav url', url)
            setCurrentHostStatus({
              loading,
              url,
              previousHomeUrl: url.startsWith(homeUri)
                ? url
                : currentHostStatus.previousHomeUrl,
              previousUrl: currentHostStatus.url,
            })
            tellWebviewToSetNativeFlag()
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
export default App
