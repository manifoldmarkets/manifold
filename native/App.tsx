import { app, auth, ENV } from './init'
import React, { useEffect, useRef, useState } from 'react'
import WebView from 'react-native-webview'
import 'expo-dev-client'
import { EXTERNAL_REDIRECTS } from 'common/src/envs/constants'
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
  Share,
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { User as FirebaseUser } from 'firebase/auth'
// @ts-ignore
import * as LinkingManager from 'react-native/Libraries/Linking/NativeLinkingManager'
import * as Linking from 'expo-linking'
import { Subscription } from 'expo-modules-core'
import { setFirebaseUserViaJson } from 'common/src/firebase-auth'
import * as Sentry from 'sentry-expo'
import { StatusBar } from 'expo-status-bar'
import { AuthPage } from 'components/auth-page'
import { IosIapListener } from 'components/ios-iap-listener'
import { withIAPContext } from 'react-native-iap'
import { getSourceUrl, Notification } from 'common/src/notification'
import { SplashLoading } from 'components/splash-loading'
import {
  nativeToWebMessage,
  nativeToWebMessageType,
  webToNativeMessage,
} from 'common/src/native-message'
import {
  handleWebviewCrash,
  ExternalWebView,
  sharedWebViewProps,
  handleWebviewError,
  handleRenderError,
} from 'components/external-web-view'
import { ExportLogsButton, log } from 'components/logger'
import { ReadexPro_400Regular, useFonts } from '@expo-google-fonts/readex-pro'
import Constants from 'expo-constants'
import { NativeShareData } from 'common/src/native-share-data'
import { clearData, getData, storeData } from './lib/auth'

// no other uri works for API requests due to CORS
// const uri = 'http://localhost:3000/'
const baseUri =
  ENV === 'DEV' ? 'https://dev.manifold.markets/' : 'https://manifold.markets/'
const nativeQuery = `?nativePlatform=${Platform.OS}`
const isIOS = Platform.OS === 'ios'
const App = () => {
  // Init
  const [hasLoadedWebView, setHasLoadedWebView] = useState(false)
  const [lastNotificationInMemory, setLastNotificationInMemory] = useState<
    Notification | undefined
  >()
  const webview = useRef<WebView>(null)
  const notificationResponseListener = useRef<Subscription>()
  useFonts({ ReadexPro_400Regular })

  // Auth
  const [waitingForAuth, setWaitingForAuth] = useState(false)
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(auth.currentUser)
  // Auth.currentUser wasn't updating (probably due to our hacky auth solution), so tracking the state manually
  auth.onAuthStateChanged((user) => {
    if (user) setFbUser(user)
  })
  useEffect(() => {
    getData<FirebaseUser>('user').then((user) => {
      if (!user) return
      console.log('Got user from storage', user.email)
      setFbUser(user)
      webview.current?.postMessage(
        JSON.stringify({ type: 'nativeFbUser', data: user })
      )
    })
  }, [hasLoadedWebView])

  useEffect(() => {
    log(`Webview has loaded ${hasLoadedWebView}. user: ${fbUser?.uid}`)
    // Wait a couple seconds after webview has loaded to see if we get a cached user from the client
    if (hasLoadedWebView && !fbUser) {
      log('Has loaded webview with no user, waiting for auth')
      const timeout = setTimeout(() => {
        log('Still no cached users, redirecting to sign in')
        setWaitingForAuth(false)
      }, 2000)
      return () => {
        log('clearing auth timeout')
        clearTimeout(timeout)
      }
    }
  }, [hasLoadedWebView, fbUser])

  // Url management
  const [urlToLoad, setUrlToLoad] = useState<string>(
    baseUri + '/home' + nativeQuery
  )
  const [externalUrl, setExternalUrl] = useState<string | undefined>(undefined)
  const linkedUrl = Linking.useURL()
  const eventEmitter = new NativeEventEmitter(
    isIOS ? LinkingManager.default : null
  )

  // UI
  const [backgroundColor, setBackgroundColor] = useState('rgba(255,255,255,1)')
  const [theme, setTheme] = useState<'dark' | 'light'>('light')

  const setUrlWithNativeQuery = (endpoint?: string) => {
    const newUrl = baseUri + (endpoint ?? '/home') + nativeQuery
    log('Setting new url', newUrl)
    // React native doesn't come with Url, so we may want to use a library
    setUrlToLoad(newUrl)
  }

  const [allowSystemBack, setAllowSystemBack] = useState(
    sharedWebViewProps.allowsBackForwardNavigationGestures
  )
  // IAP
  const [checkoutAmount, setCheckoutAmount] = useState<number | null>(null)

  const handlePushNotification = async (
    response: Notifications.NotificationResponse
  ) => {
    log('Push notification tapped, has loaded webview:', hasLoadedWebView)
    log('webview.current:', webview.current)
    // Perhaps this isn't current if the webview is killed for memory collection? Not sure
    const notification = response.notification.request.content
      .data as Notification
    if (hasLoadedWebView) {
      communicateWithWebview(
        'notification',
        response.notification.request.content.data
      )
      setLastNotificationInMemory(notification)
    } else setUrlWithNativeQuery(getSourceUrl(notification))
  }

  useEffect(() => {
    log(
      'Running lastNotificationInMemory effect, has loaded webview:',
      hasLoadedWebView
    )
    log('last notification in memory', lastNotificationInMemory)
    // If there's a notification in memory and the webview has not loaded, set it as the url to load
    if (lastNotificationInMemory && !hasLoadedWebView) {
      log(
        'Setting url to load from last notification in memory',
        lastNotificationInMemory
      )
      setUrlWithNativeQuery(getSourceUrl(lastNotificationInMemory))
    }
    if (lastNotificationInMemory) {
      // Delete the last notification in memory after 3 seconds
      const timeout = setTimeout(() => {
        setLastNotificationInMemory(undefined)
        log('Cleared last notification in memory')
      }, 3000)
      return () => {
        clearTimeout(timeout)
        log('Cleared last notification in memory timeout')
      }
    }
  }, [lastNotificationInMemory, hasLoadedWebView])

  useEffect(() => {
    // This listener is fired whenever a user taps on or interacts with a notification (works when app is foregrounded, backgrounded, or killed)
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        handlePushNotification
      )

    return () => {
      notificationResponseListener.current &&
        Notifications.removeNotificationSubscription(
          notificationResponseListener.current
        )
    }
  }, [hasLoadedWebView])

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      log('Initial url', url, 'has loaded webview:', hasLoadedWebView)
      if (url) {
        setUrlToLoad(url)
      }
    })
    BackHandler.addEventListener('hardwareBackPress', handleBackButtonPress)
    return () =>
      BackHandler.removeEventListener(
        'hardwareBackPress',
        handleBackButtonPress
      )
  }, [])

  // Handle deep links
  useEffect(() => {
    if (!linkedUrl) return
    log('Linked url', linkedUrl)
    log('Has loaded webview', hasLoadedWebView)
    log('webview:', webview.current)

    const { hostname, path, queryParams } = Linking.parse(linkedUrl)
    if (path !== 'blank' && hostname) {
      log(
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
      log('[handleBackButtonPress] Error : ', err)
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
    const projectId = Constants.expoConfig?.extra?.eas.projectId
    console.log('projectId', projectId)
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data
    log(token)
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
          userId: fbUser?.uid,
        })
        return null
      }
      return await getPushToken()
    } catch (e) {
      Sentry.Native.captureException(e, {
        extra: { message: 'error registering for push notifications' },
      })
      log('Error registering for push notifications', e)
      return null
    }
  }

  const handleMessageFromWebview = async ({ nativeEvent }: any) => {
    const { data } = nativeEvent
    const { type, data: payload } = JSON.parse(data) as webToNativeMessage
    if (type === 'checkout') {
      setCheckoutAmount(payload.amount)
    }
    // We handle auth with a custom screen, so if the user sees a login button on the client, we're out of sync
    else if (type === 'loginClicked') {
      await signOutUsers('Error on sign out before sign in')
    } else if (type === 'tryToGetPushTokenWithoutPrompt') {
      getExistingPushNotificationStatus().then(async (status) => {
        if (status === 'granted') {
          const token = await getPushToken()
          if (!webview.current) return
          if (token)
            communicateWithWebview('pushToken', {
              token,
              userId: fbUser?.uid,
            })
        } else
          communicateWithWebview('pushNotificationPermissionStatus', {
            status,
            userId: fbUser?.uid,
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
            userId: fbUser?.uid,
          })
      })
    } else if (type === 'signOut') {
      await signOutUsers('Error on sign out')
    }
    // Receiving cached firebase user from webview cache
    else if (type === 'users') {
      try {
        const fbUserAndPrivateUser = JSON.parse(payload)
        if (fbUserAndPrivateUser && fbUserAndPrivateUser.fbUser) {
          const fbUser = fbUserAndPrivateUser.fbUser as FirebaseUser
          log('Signing in fb user from webview cache')
          await setFirebaseUserViaJson(fbUser, app)
          await storeData('user', fbUser)
        }
      } catch (e) {
        Sentry.Native.captureException(e, {
          extra: { message: 'error parsing users from client' },
        })
      }
    } else if (type == 'onPageVisit') {
      if (!isIOS) return // Android doesn't use the swipe to go back
      const { page } = payload
      log('page:', page)
      setAllowSystemBack(page !== 'swipe')
    } else if (type === 'share') {
      const { url, title, message } = payload as NativeShareData
      log('Sharing:', message, url, title)
      await Share.share({
        url,
        title,
        message,
      })
    } else if (type === 'theme') {
      const { theme, backgroundColor } = payload
      setBackgroundColor(backgroundColor)
      setTheme(theme)
    } else if (type === 'log') {
      const { args } = payload
      log('[Web Console]', ...args)
    } else {
      log('Unhandled message from web type: ', type)
      log('Unhandled message from web data: ', data)
    }
  }

  const signOutUsers = async (errorMessage: string) => {
    setFbUser(null)
    try {
      await auth.signOut()
    } catch (err) {
      log(errorMessage, err)
      Sentry.Native.captureException(err, {
        extra: { message: errorMessage },
      })
    }
    await clearData('user').catch((err) => {
      log('Error clearing user data', err)
      Sentry.Native.captureException(err, {
        extra: { message: 'error clearing user data' },
      })
    })
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

  const webViewAndUserLoaded = hasLoadedWebView && fbUser
  const width = Dimensions.get('window').width //full width
  const height = Dimensions.get('window').height //full height
  const styles = StyleSheet.create({
    container: {
      display: webViewAndUserLoaded ? 'flex' : 'none',
      flex: 1,
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: backgroundColor,
    },
    webView: {
      display: webViewAndUserLoaded ? 'flex' : 'none',
      overflow: 'hidden',
      marginTop: isIOS ? 0 : RNStatusBar.currentHeight ?? 0,
      marginBottom: !isIOS ? 10 : 0,
    },
  })

  return (
    <>
      {!webViewAndUserLoaded && waitingForAuth ? (
        <SplashLoading
          height={height}
          width={width}
          source={require('./assets/splash.png')}
        />
      ) : (
        hasLoadedWebView &&
        !fbUser &&
        !waitingForAuth && (
          <AuthPage webview={webview} height={height} width={width} />
        )
      )}
      {Platform.OS === 'ios' && Device.isDevice && webViewAndUserLoaded && (
        <IosIapListener
          checkoutAmount={checkoutAmount}
          setCheckoutAmount={setCheckoutAmount}
          communicateWithWebview={communicateWithWebview}
        />
      )}

      <SafeAreaView style={styles.container}>
        <StatusBar
          animated={true}
          style={theme === 'dark' ? 'light' : 'dark'}
          hidden={false}
        />

        <View style={[styles.container, { position: 'relative' }]}>
          <ExternalWebView
            url={externalUrl}
            height={height}
            width={width}
            setUrl={setExternalUrl}
          />
          <WebView
            {...sharedWebViewProps}
            allowsBackForwardNavigationGestures={allowSystemBack}
            style={styles.webView}
            // Load start and end is for whole website loading, not navigations within manifold
            onLoadEnd={() => {
              log('WebView onLoadEnd')
              setHasLoadedWebView(true)
            }}
            source={{ uri: urlToLoad }}
            ref={webview}
            onError={(e) =>
              handleWebviewError(e, () => setUrlWithNativeQuery())
            }
            renderError={(e) => handleRenderError(e, width, height)}
            // On navigation state change changes on every url change
            onNavigationStateChange={(navState) => {
              const { url } = navState
              if (
                !url.startsWith(baseUri) ||
                EXTERNAL_REDIRECTS.some((u) => url.endsWith(u))
              ) {
                setExternalUrl(url)
                webview.current?.stopLoading()
              } else {
                setExternalUrl(undefined)
              }
            }}
            onRenderProcessGone={(e) =>
              handleWebviewCrash(webview, e, () => setHasLoadedWebView(false))
            }
            onContentProcessDidTerminate={(e) =>
              handleWebviewCrash(webview, e, () => setHasLoadedWebView(false))
            }
            onMessage={async (m) => {
              try {
                await handleMessageFromWebview(m)
              } catch (e) {
                log('Error in handleMessageFromWebview', e)
              }
            }}
          />
        </View>
      </SafeAreaView>
      {/*<ExportLogsButton />*/}
    </>
  )
}
export default withIAPContext(App)
