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
  StyleSheet,
  SafeAreaView,
  StatusBar as RNStatusBar,
  Dimensions,
  View,
  Text,
  Pressable,
  Share,
  NativeScrollEvent,
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
import { IosIapListener } from 'components/ios-iap-listener'
import { withIAPContext } from 'react-native-iap'
import { getSourceUrl, Notification } from 'common/notification'
import { WebViewErrorEvent } from 'react-native-webview/lib/WebViewTypes'
import { BackButton } from 'components/back-button'
import { SplashLoading } from 'components/splash-loading'
import {
  nativeToWebMessage,
  nativeToWebMessageType,
  webToNativeMessage,
} from 'common/native-message'
import { useFonts, ReadexPro_400Regular } from '@expo-google-fonts/readex-pro'
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
  ENV === 'DEV' ? 'https://dev.manifold.markets/' : 'https://manifold.markets/'

export type NavigationState = {
  previousHomeUrl: string
  previousUrl: string
  url: string
  loading: boolean
  canGoBack: boolean
  scrollEvent: NativeScrollEvent | undefined
  isOnContractPage: boolean
}
const App = () => {
  // Init
  const hasWebViewLoaded = useRef(false)
  const [hasSetNativeFlag, setHasSetNativeFlag] = useState(false)
  const isIOS = Platform.OS === 'ios'
  const webview = useRef<WebView | undefined>()
  const notificationResponseListener = useRef<Subscription | undefined>()
  useFonts({ ReadexPro_400Regular })

  // Auth
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Url management
  const [currentNavState, setCurrentNavState] = useState<NavigationState>({
    previousHomeUrl: homeUri,
    previousUrl: homeUri,
    url: homeUri,
    loading: true,
    canGoBack: false,
    scrollEvent: undefined,
    isOnContractPage: false,
  })
  const [urlToLoad, setUrlToLoad] = useState<string>(homeUri)
  const isVisitingOtherSite =
    !currentNavState.url.startsWith(homeUri) ||
    (currentNavState.loading &&
      !currentNavState.previousUrl.startsWith(homeUri))
  const linkedUrl = Linking.useURL()
  const eventEmitter = new NativeEventEmitter(
    Platform.OS === 'ios' ? LinkingManager.default : null
  )

  // IAP
  const [checkoutAmount, setCheckoutAmount] = useState<number | null>(null)

  const handlePushNotification = async (
    response: Notifications.NotificationResponse
  ) => {
    if (hasWebViewLoaded.current) {
      communicateWithWebview(
        'notification',
        response.notification.request.content.data
      )
    } else {
      const notification = response.notification.request.content
        .data as Notification
      const sourceUrl = getSourceUrl(notification)
      setUrlToLoad(homeUri + sourceUrl)
    }
  }

  // Initialize listeners
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) {
        setUrlToLoad(url)
      }
    })
    try {
      BackHandler.addEventListener('hardwareBackPress', handleBackButtonPress)

      // This listener is fired whenever a user taps on or interacts with a notification (works when app is foregrounded, backgrounded, or killed)
      notificationResponseListener.current =
        Notifications.addNotificationResponseReceivedListener(
          handlePushNotification
        )
    } catch (err) {
      Sentry.Native.captureException(err, {
        extra: { message: 'notification & back listener' },
      })
      console.log('[notification & back listener] Error : ', err)
    }

    return () => {
      notificationResponseListener.current &&
        Notifications.removeNotificationSubscription(
          notificationResponseListener.current
        )
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
      communicateWithWebview('link', { url: path ? path : '/' })
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
    return status
  }

  const getPushToken = async () => {
    const appConfig = require('./app.json')
    const projectId = appConfig.expo.extra.eas.projectId
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
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }
      if (finalStatus !== 'granted') {
        communicateWithWebview('pushNotificationPermissionStatus', {
          status: finalStatus,
          userId: auth.currentUser?.uid,
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
    const { type, data: payload } = JSON.parse(data) as webToNativeMessage
    setHasSetNativeFlag(true)
    if (type === 'checkout') {
      setCheckoutAmount(payload.amount)
    } else if (type === 'loginClicked') {
      if (auth.currentUser) {
        try {
          // Let's start from a clean slate if the webview and native auths are out of sync
          auth.signOut().then(() => {
            setShowAuthModal(true)
          })
        } catch (err) {
          console.log('[sign out before sign in] Error : ', err)
          Sentry.Native.captureException(err, {
            extra: { message: 'sign out before sign in' },
          })
        }
      } else setShowAuthModal(true)
    } else if (type === 'tryToGetPushTokenWithoutPrompt') {
      getExistingPushNotificationStatus().then(async (status) => {
        if (status === 'granted') {
          const token = await getPushToken()
          if (!webview.current) return
          if (token)
            communicateWithWebview('pushToken', {
              token,
              userId: auth.currentUser?.uid,
            })
        } else
          communicateWithWebview('pushNotificationPermissionStatus', {
            status,
            userId: auth.currentUser?.uid,
          })
      })
    } else if (type === 'copyToClipboard') {
      Clipboard.setString(payload)
    }
    // User needs to enable push notifications
    else if (type === 'promptEnablePushNotifications') {
      registerForPushNotificationsAsync().then((token) => {
        if (token)
          communicateWithWebview('pushToken', {
            token,
            userId: auth.currentUser?.uid,
          })
      })
    } else if (type === 'signOut') {
      try {
        auth.signOut()
      } catch (err) {
        console.log('[signOut] Error : ', err)
        Sentry.Native.captureException(err, {
          extra: { message: 'sign out' },
        })
      }
    }
    // Receiving cached firebase user from webview cache
    else if (type === 'users') {
      try {
        const fbUserAndPrivateUser = JSON.parse(payload)
        // Passing us a signed-in user object
        if (fbUserAndPrivateUser && fbUserAndPrivateUser.fbUser) {
          console.log('Signing in fb user from webview cache')
          setFirebaseUserViaJson(fbUserAndPrivateUser.fbUser, app)
        }
      } catch (e) {
        Sentry.Native.captureException(e, {
          extra: { message: 'error parsing nativeEvent.data' },
        })
      }
    } else if (type === 'isContractPage') {
      setCurrentNavState({
        ...currentNavState,
        isOnContractPage: true,
      })
    } else {
      console.log('Unhandled nativeEvent.data: ', data)
    }
  }

  const tellWebviewToSetNativeFlag = () => {
    if (hasSetNativeFlag) return
    communicateWithWebview('setIsNative', { platform: Platform.OS })
  }

  const communicateWithWebview = (
    type: nativeToWebMessageType,
    data: object
  ) => {
    webview.current?.postMessage(
      JSON.stringify({
        type,
        data,
      } as nativeToWebMessage)
    )
  }

  const handleWebviewError = (e: WebViewErrorEvent) => {
    const { nativeEvent } = e
    console.log('error in webview', e)
    Sentry.Native.captureException(nativeEvent.description, {
      extra: {
        message: 'webview error',
        nativeEvent,
      },
    })
    // fall back to home uri on error
    setUrlToLoad(homeUri)
  }

  const width = Dimensions.get('window').width //full width
  const height = Dimensions.get('window').height //full height
  const styles = StyleSheet.create({
    container: {
      display: !hasWebViewLoaded.current ? 'none' : 'flex',
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
      display: !hasWebViewLoaded.current ? 'none' : 'flex',
      overflow: 'hidden',
      marginTop:
        (isIOS ? 0 : RNStatusBar.currentHeight ?? 0) +
        (isVisitingOtherSite ? 40 : 0),
      marginBottom: !isIOS ? 10 : 0,
    },
    otherSiteToolbar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: isIOS ? 90 : 75,
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
      {Platform.OS === 'ios' && (
        <IosIapListener
          checkoutAmount={checkoutAmount}
          setCheckoutAmount={setCheckoutAmount}
          communicateWithWebview={communicateWithWebview}
        />
      )}
      {!hasWebViewLoaded.current && (
        <SplashLoading
          height={height}
          width={width}
          source={require('./assets/splash.png')}
        />
      )}
      <SafeAreaView style={styles.container}>
        <View style={[styles.container, { position: 'relative' }]}>
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
                  const { previousHomeUrl } = currentNavState
                  // In order to make the webview load a new url manually it has to be different from the previous one
                  const back = !previousHomeUrl.includes('?')
                    ? `${previousHomeUrl}?ignoreThisQuery=true`
                    : `${previousHomeUrl}&ignoreThisQuery=true`
                  setUrlToLoad(back)
                }}
              >
                <Text style={styles.toolBarText}>Done</Text>
              </Pressable>
              <Pressable
                style={styles.toolBarIcon}
                onPress={async () => {
                  await Share.share({
                    message: currentNavState.url,
                  })
                }}
              >
                <Feather name="share" size={24} color="black" />
              </Pressable>
              <Pressable
                style={[styles.toolBarIcon, { justifyContent: 'flex-end' }]}
                onPress={async () => {
                  if (currentNavState.loading) {
                    webview.current?.stopLoading()
                    setCurrentNavState({
                      ...currentNavState,
                      loading: false,
                    })
                  } else {
                    webview.current?.reload()
                    setCurrentNavState({
                      ...currentNavState,
                      loading: true,
                    })
                  }
                }}
              >
                {currentNavState.loading ? (
                  <Feather name="x" size={24} color="black" />
                ) : (
                  <AntDesign name="reload1" size={24} color="black" />
                )}
              </Pressable>
            </View>
          </View>
          <BackButton webView={webview} navState={currentNavState} />
          <WebView
            pullToRefreshEnabled={true}
            onScroll={(e) =>
              setCurrentNavState({
                ...currentNavState,
                scrollEvent: e.nativeEvent,
              })
            }
            style={styles.webView}
            mediaPlaybackRequiresUserAction={true}
            allowsInlineMediaPlayback={true}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            overScrollMode={'never'}
            decelerationRate={'normal'}
            allowsBackForwardNavigationGestures={true}
            // Load start and end is for whole website loading, not navigations within manifold
            onLoadEnd={() => {
              hasWebViewLoaded.current = true
              setCurrentNavState({ ...currentNavState, loading: false })
            }}
            sharedCookiesEnabled={true}
            source={{ uri: urlToLoad }}
            //@ts-ignore
            ref={webview}
            onError={(e) => handleWebviewError(e)}
            renderError={(e) => {
              // Renders this view while we resolve the error
              return (
                <View style={{ height, width }}>
                  <SplashLoading
                    height={height}
                    width={width}
                    source={require('./assets/splash.png')}
                  />
                </View>
              )
            }}
            onTouchStart={() => {
              tellWebviewToSetNativeFlag()
            }}
            // Load start and end is for whole website loading, not navigations within manifold
            onLoadStart={() => {
              setCurrentNavState({ ...currentNavState, loading: true })
            }}
            // On navigation state change changes on every url change, it doesn't update loading
            onNavigationStateChange={(navState) => {
              const { url, canGoBack } = navState
              setCurrentNavState({
                ...currentNavState,
                url,
                previousHomeUrl: url.startsWith(homeUri)
                  ? url
                  : currentNavState.previousHomeUrl,
                previousUrl: currentNavState.url,
                canGoBack,
                isOnContractPage: false,
              })
              tellWebviewToSetNativeFlag()
            }}
            onRenderProcessGone={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent
              console.warn(
                'Content process terminated, reloading android',
                nativeEvent.didCrash
              )
              webview.current?.reload()
            }}
            onContentProcessDidTerminate={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent
              console.warn(
                'Content process terminated, reloading ios ',
                nativeEvent
              )
              webview.current?.reload()
            }}
            onMessage={handleMessageFromWebview}
          />
          <AuthModal
            showModal={showAuthModal}
            setShowModal={setShowAuthModal}
            webview={webview}
          />
        </View>
      </SafeAreaView>
    </>
  )
}
export default withIAPContext(App)
