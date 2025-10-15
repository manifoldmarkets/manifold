import { ReadexPro_400Regular, useFonts } from '@expo-google-fonts/readex-pro'
import Clipboard from '@react-native-clipboard/clipboard'
import * as Sentry from '@sentry/react-native'
import { EXTERNAL_REDIRECTS, isAdminId } from 'common/envs/constants'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import {
  MesageTypeMap,
  nativeToWebMessage,
  nativeToWebMessageType,
  webToNativeMessage,
} from 'common/native-message'
import { NativeShareData } from 'common/native-share-data'
import { getSourceUrl, Notification } from 'common/notification'
import { CustomWebview } from 'components/custom-webview'
import { log } from 'components/logger'
import { SplashAuth } from 'components/splash-auth'
import * as ExpoClipboard from 'expo-clipboard'
import Constants from 'expo-constants'
import 'expo-dev-client'
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import * as StoreReview from 'expo-store-review'
import * as WebBrowser from 'expo-web-browser'
import { User as FirebaseUser } from 'firebase/auth'
import { clearData, getData, storeData } from 'lib/auth'
import { checkLocationPermission, getLocation } from 'lib/location'
import { useIsConnected } from 'lib/use-is-connected'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, Platform, Share, StyleSheet } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import WebView from 'react-native-webview'
import { app, auth, ENV } from './init'

Sentry.init({
  dsn: 'https://2353d2023dad4bc192d293c8ce13b9a1@o4504040581496832.ingest.us.sentry.io/4504040585494528',
  debug: ENV === 'DEV',
})

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync()
// NOTE: you must change NEXT_PUBLIC_API_URL in dev.sh to match your local IP address. ie:
// "cross-env NEXT_PUBLIC_API_URL=192.168.1.229:8088 \
// Then, set the native url in the app on the user settings page: http://192.168.1.229:3000/

// If you're changing native code: uncomment the line below
// const BASE_URI = 'http://192.168.1.229:3000/'
// const BASE_URI = 'http://192.168.1.99:3001/'

const BASE_URI =
  ENV === 'DEV' ? 'https://dev.manifold.markets/' : 'https://manifold.markets/'

// Set up notification handler before component
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

const App = () => {
  // Init
  const webview = useRef<WebView>(null)
  useFonts({ ReadexPro_400Regular })

  // This tracks if the webview has loaded its first page
  const [hasLoadedWebView, setHasLoadedWebView] = useState(false)
  // This tracks if the app has its nativeMessageListener set up
  // NOTE: After the webview is killed on android due to OOM, this will always be false, see: https://github.com/react-native-webview/react-native-webview/issues/2680
  const listeningToNative = useRef(false)
  const [baseUri, setBaseUri] = useState(BASE_URI)

  // Auth
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(auth.currentUser)
  // Auth.currentUser didn't update, so we track the state manually
  auth.onAuthStateChanged((user) => (user ? setFbUser(user) : null))

  const signInUserFromStorage = async () => {
    const user = await getData<FirebaseUser>('user')
    if (!user) return
    log('Got user from storage:', user.email)
    setFbUser(user)
    sendWebviewAuthInfo(user)
    await setFirebaseUserViaJson(user, app)
  }

  useEffect(() => {
    signInUserFromStorage()
    clearData('lastNotificationIds') // no longer used, clear them from local storage
  }, [])

  // Sends the saved user to the web client to make the log in process faster
  const sendWebviewAuthInfo = (user: FirebaseUser) => {
    // We use a timeout because sometimes the auth persistence manager is still undefined on the client side
    // Seems my iPhone 12 mini can regularly handle a shorter timeout
    const timeouts = [100, 500, 1000, 3000]
    timeouts.forEach((timeout) => {
      setTimeout(() => {
        communicateWithWebview('nativeFbUser', user)
      }, timeout)
    })
  }

  // Url management
  const [urlToLoad, setUrlToLoad] = useState<string>(() => {
    const url = new URL(baseUri)
    url.pathname = 'home'
    const params = new URLSearchParams()
    params.set('nativePlatform', Platform.OS)
    url.search = params.toString()
    return url.toString()
  })
  const linkedUrl = Linking.useLinkingURL()

  // UI
  const [backgroundColor, setBackgroundColor] = useState('rgba(255,255,255,1)')
  const [theme, setTheme] = useState<'dark' | 'light'>('light')

  const setEndpointWithNativeQuery = useCallback(
    (endpoint?: string) => {
      const url = baseUri + (endpoint || 'home')
      setUrlWithNativeQuery(url)
    },
    [baseUri]
  )

  const setUrlWithNativeQuery = (urlString: string) => {
    const [baseUrl, fragment] = urlString.split('#')
    const url = new URL(baseUrl)

    const params = new URLSearchParams()
    params.set('nativePlatform', Platform.OS)
    params.set('rand', Math.random().toString())
    url.search = params.toString()

    const newUrl = url.toString() + (fragment ? `#${fragment}` : '')
    log('Setting new url:', newUrl)
    setUrlToLoad(newUrl)
  }

  const handlePushNotification = async (
    response: Notifications.NotificationResponse
  ) => {
    log(
      'Push notification tapped, has loaded webview:',
      hasLoadedWebView,
      ', is listening to native:',
      listeningToNative.current
    )
    log('webview.current:', webview.current)
    // Perhaps this isn't current if the webview is killed for memory collection? Not sure
    const notification = response.notification.request.content
      .data as Notification
    if (!notification || !notification.reason) {
      log('Ignoring notification with missing data:', notification)
      return
    }
    log('handling notification', notification.reason)

    // Resolve the destination URL from the notification.
    const destination = getSourceUrl(notification)

    // Don't navigate if we don't have a valid destination
    if (!destination) {
      log('No valid destination from notification, skipping navigation')
      return
    }

    // If the webview is already loaded and listening, forward the message so
    // the web client can mark the notification as seen, etc.
    if (hasLoadedWebView && listeningToNative.current) {
      communicateWithWebview('notification', notification)
    }

    // Always set the URL so that, even if the message is missed, the webview
    // navigates to the correct page when it becomes active.
    setEndpointWithNativeQuery(destination)
  }

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackButtonPress
    )
    return () => backHandler.remove()
  }, [])

  const lastNotifResponse = Notifications.useLastNotificationResponse()
  useEffect(() => {
    if (
      lastNotifResponse &&
      lastNotifResponse.notification.request.content.data &&
      lastNotifResponse.actionIdentifier ===
        Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      log(
        'processing lastNotificationResponse',
        lastNotifResponse.notification.request.content.data.reason
      )
      handlePushNotification(lastNotifResponse)
      Notifications.clearLastNotificationResponseAsync()
    }
  }, [lastNotifResponse])

  // Handle deep links
  useEffect(() => {
    if (!linkedUrl || linkedUrl === 'blank') return
    const { hostname, path, queryParams } = Linking.parse(linkedUrl)
    if (path !== 'blank' && hostname) {
      // Extract path and query params properly regardless of URL scheme
      let url = path || '/home'

      // Ensure path has leading slash
      if (url && !url.startsWith('/')) {
        url = '/' + url
      }

      // Add query parameters if they exist
      if (queryParams && Object.keys(queryParams).length > 0) {
        const queryString = new URLSearchParams(
          queryParams as Record<string, string>
        ).toString()
        url = `${url}?${queryString}`
      }

      // Normalize: if root path, redirect to home
      if (url === '/' || url === '') {
        url = '/home'
      }

      log(
        'Linked url',
        url,
        ', has loaded webview:',
        hasLoadedWebView,
        ', path:',
        url
      )
      if (hasLoadedWebView && listeningToNative.current)
        communicateWithWebview('link', { url })
      else setEndpointWithNativeQuery(url)
    }
  }, [linkedUrl])

  const handleBackButtonPress = () => {
    try {
      webview.current?.goBack()
      return true
    } catch (err) {
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
    log('projectId', projectId)
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data
    log(token)
    return token
  }

  const registerForPushNotificationsAsync = async () => {
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
        })
        return null
      }
      return await getPushToken()
    } catch (e) {
      log('Error registering for push notifications', e)
      return null
    }
  }

  const handleMessageFromWebview = async ({ nativeEvent }: any) => {
    const { data } = nativeEvent
    const { type, data: payload } = JSON.parse(data) as webToNativeMessage
    // We handle auth with a custom screen, so if the user sees a login button on the client, we're out of sync
    if (type === 'loginClicked') {
      await signOutUsers('Error on sign out before sign in')
    } else if (type === 'tryToGetPushTokenWithoutPrompt') {
      getExistingPushNotificationStatus().then(async (status) => {
        if (status === 'granted') {
          const token = await getPushToken()
          if (!webview.current) return
          if (token)
            communicateWithWebview('pushToken', {
              token,
            })
        } else
          communicateWithWebview('pushNotificationPermissionStatus', {
            status,
          })
      })
    } else if (type === 'copyToClipboard') {
      Clipboard.setString(payload)
    } else if (type === 'copyImageToClipboard') {
      const { imageDataUri } = payload as { imageDataUri: string }
      if (imageDataUri) {
        // Strip the prefix (e.g., "data:image/png;base64,")
        const base64Data = imageDataUri.split(',')[1]
        if (base64Data) {
          ExpoClipboard.setImageAsync(base64Data)
            .then(() => {
              log('Image copy success')
              // Maybe send a success/error message back to webview?
            })
            .catch((e: Error) => {
              log('Error copying image to clipboard:', e)
              // communicateWithWebview('imageCopyResult', { success: false, error: e.message })
            })
        } else {
          log('Failed to extract base64 data from imageDataUri')
        }
      } else {
        log('copyImageToClipboard message received without imageDataUri')
      }
    }
    // User needs to enable push notifications
    else if (type === 'promptEnablePushNotifications') {
      registerForPushNotificationsAsync().then((token) => {
        if (token)
          communicateWithWebview('pushToken', {
            token,
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
          // log('Signing in fb user from webview cache')
          // We don't actually use the firebase auth for anything right now, but in case we do in the future...
          await setFirebaseUserViaJson(fbUser, app)
          await storeData('user', fbUser)
        }
      } catch (e) {
        log('error signing in users', e)
      }
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
    } else if (type === 'startedListening') {
      log('Client started listening')
      listeningToNative.current = true
      if (fbUser) sendWebviewAuthInfo(fbUser)
    } else if (type === 'locationPermissionStatusRequested') {
      log('Location permission status requested from web')
      const status = await checkLocationPermission()
      communicateWithWebview('locationPermissionStatus', { status })
    } else if (type === 'locationRequested') {
      log('Location requested from web')
      const location = await getLocation()
      communicateWithWebview('location', location)
    } else if (type === 'storeReviewRequested') {
      log('Store review requested from web')
      StoreReview.requestReview()
    } else if (type === 'hasReviewActionRequested') {
      log('Has review action requested from web')
      const isAvailable = await StoreReview.isAvailableAsync()
      const hasAction = await StoreReview.hasAction()
      communicateWithWebview('hasReviewAction', { hasAction, isAvailable })
    } else if (type === 'versionRequested') {
      log('Version requested from web')
      const version = Constants.expoConfig?.version
      communicateWithWebview('version', { version })
    } else if (type === 'setAppUrl') {
      if (!fbUser?.uid || !isAdminId(fbUser.uid)) return
      log('Setting app url to: ', payload.appUrl)
      setBaseUri(payload.appUrl)
      setUrlWithNativeQuery(payload.appUrl)
    } else {
      log('Unhandled message from web type: ', type)
      log('Unhandled message from web data: ', data)
    }
  }

  const signOutUsers = async (errorMessage: string) => {
    try {
      await auth.signOut()
    } catch (err) {
      log(errorMessage, err)
    }
    setFbUser(null)
    await clearData('user').catch((err) => {
      log('Error clearing user data', err)
    })
  }

  const communicateWithWebview = <T extends nativeToWebMessageType>(
    type: T,
    data: MesageTypeMap[T]
  ) => {
    // log(
    //   'Sending message to webview:',
    //   type,
    //   'is listening:',
    //   listeningToNative.current
    // )
    webview.current?.postMessage(
      JSON.stringify({
        type,
        data,
      } as nativeToWebMessage)
    )
  }

  const resetWebView = () => {
    setHasLoadedWebView(false)
    listeningToNative.current = false
    setEndpointWithNativeQuery()
    log('Reloading webview, webview.current:', webview.current)
    webview.current?.reload()
  }

  const isConnected = useIsConnected()
  const fullyLoaded = hasLoadedWebView && fbUser && isConnected

  // Hide splash screen when app is fully loaded
  useEffect(() => {
    const hideSplashScreen = async () => {
      if (hasLoadedWebView) {
        try {
          await SplashScreen.hideAsync()
          log('Splash screen hidden - app fully loaded')
        } catch (error) {
          log('Error hiding splash screen:', error)
        }
      }
    }
    hideSplashScreen()
  }, [hasLoadedWebView])

  const styles = StyleSheet.create({
    container: {
      display: 'flex',
      flex: 1,
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: fullyLoaded ? backgroundColor : '#4337C9',
    },
  })

  const handleExternalLink = useCallback(
    (url: string) => {
      if (
        !url.startsWith(baseUri) ||
        EXTERNAL_REDIRECTS.some((u) => url.endsWith(u))
      ) {
        webview.current?.stopLoading()
        WebBrowser.openBrowserAsync(url)
        return
      }
    },
    [baseUri]
  )

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={styles.container}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <StatusBar
          animated={true}
          style={theme === 'dark' ? 'light' : 'dark'}
          hidden={false}
        />
        <SplashAuth
          webview={webview}
          hasLoadedWebView={hasLoadedWebView}
          fbUser={fbUser}
          isConnected={isConnected}
        />
        <CustomWebview
          display={!!fullyLoaded}
          urlToLoad={urlToLoad}
          webview={webview}
          resetWebView={resetWebView}
          setHasLoadedWebView={setHasLoadedWebView}
          handleMessageFromWebview={handleMessageFromWebview}
          handleExternalLink={handleExternalLink}
        />
      </SafeAreaView>
      {/*<ExportLogsButton />*/}
    </SafeAreaProvider>
  )
}
export default Sentry.wrap(App)
