import { ReadexPro_400Regular, useFonts } from '@expo-google-fonts/readex-pro'
import Clipboard from '@react-native-clipboard/clipboard'
import * as Sentry from '@sentry/react-native'
import { CONFIGS, EXTERNAL_REDIRECTS, isAdminId } from 'common/envs/constants'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import {
  MesageTypeMap,
  NativeQuestData,
  NativeStreakData,
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
import {
  clearQuestWidget,
  clearStreakWidget,
  fetchStreakSnapshot,
  writeQuestWidget,
  writeStreakWidget,
} from 'lib/streak-widget'
import { useIsConnected } from 'lib/use-is-connected'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppState,
  BackHandler,
  NativeModules,
  Platform,
  Share,
  StyleSheet,
} from 'react-native'
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
  // Stores a notification that arrived before the webview was ready (cold start).
  // Delivered once the web app signals 'startedListening'.
  const pendingNotification = useRef<{
    notification: Notification
    destination: string
  } | null>(null)
  const [baseUri, setBaseUri] = useState(BASE_URI)

  // Auth
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(auth.currentUser)
  // Mirror of fbUser for callbacks that outlive the render they were created in
  // (the auth handoff timers below): a ref reads the latest value, a closure
  // reads the value from when it was scheduled.
  const fbUserRef = useRef<FirebaseUser | null>(fbUser)
  useEffect(() => {
    fbUserRef.current = fbUser
  }, [fbUser])
  // Bumped on every native sign-out, so async work that started before the
  // sign-out can tell it has been superseded.
  const authGeneration = useRef(0)
  // Auth.currentUser didn't update, so we track the state manually.
  useEffect(
    () => auth.onAuthStateChanged((user) => (user ? setFbUser(user) : null)),
    []
  )

  // Whose data the widget currently holds: stamped when a sync starts, nulled on
  // sign-out. Deliberately a ref, not `fbUser` — syncStreakFromApi is re-created
  // every render and an in-flight call resumes with the closure it started in, so
  // reading state here would see the pre-sign-out value AND would be null during
  // the cold-start sync (signInUserFromStorage runs from the render-0 closure,
  // where fbUser is still the initial auth.currentUser), suppressing the widget's
  // very first write. The ref is stamped by the same call that later writes, so it
  // can only ever drop a write that a LATER sync or a sign-out superseded.
  const widgetUid = useRef<string | null>(null)

  // Fetches the user's streak straight from the public API and mirrors it into
  // the App Group for the home/lock-screen widget. This works against prod
  // without any web deploy — the streak fields are on the unauthenticated
  // user/by-id response. (The 'setStreak'/'setQuests' webview messages provide
  // fresher live updates, but only once the web changes are deployed.)
  const syncStreakFromApi = async (userId: string) => {
    widgetUid.current = userId
    const snapshot = await fetchStreakSnapshot(CONFIGS[ENV].apiEndpoint, userId)
    // Drop the write if the widget stopped belonging to this user while the
    // request was in flight (sign-out, or a switch to another account).
    if (snapshot && widgetUid.current === userId) writeStreakWidget(snapshot)
  }

  // Re-sync the streak widget whenever the app is backgrounded or re-activated —
  // most importantly, right after a bet when the user swipes to the home screen
  // to look at the widget. Uses the public-API sync above, so the widget updates
  // promptly against prod even before the web `setStreak` live-message ships.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if ((next === 'background' || next === 'active') && fbUser?.uid) {
        syncStreakFromApi(fbUser.uid)
        // Quest scores aren't on the public API the streak sync uses, so ask the
        // webview to re-fetch + re-push them. Lets a completed quest reach the
        // widget on the next foreground without a full reload.
        communicateWithWebview('refreshQuests', {})
      }
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbUser?.uid])

  const signInUserFromStorage = async () => {
    const user = await getData<FirebaseUser>('user')
    if (!user) return
    log('Got user from storage:', user.email)
    setFbUser(user)
    // sendWebviewAuthInfo is driven by the uid effect below, which this setFbUser
    // triggers — no need to call it here too.
    if (user.uid) syncStreakFromApi(user.uid)
    await setFirebaseUserViaJson(user, app)
  }

  useEffect(() => {
    signInUserFromStorage()
    clearData('lastNotificationIds') // no longer used, clear them from local storage
  }, [])

  // The URL the WebView currently has loaded. Identity verification navigates
  // the WebView to iDenfy's hosted page (boosts go to Stripe), and
  // WebView.postMessage dispatches into whichever document is loaded — so the
  // credential handoff below must only ever be posted into our own pages.
  // Set only from committed navigations (see CustomWebview's onNavigate), never
  // from a provisional one — a navigation START fires before the request is even
  // allowed, so an external page could otherwise be marked trusted while it is
  // still the active document.
  const webviewUrl = useRef(baseUri)
  // Full-origin match (scheme + host + port), not just host: a page served over
  // http://manifold.markets or a look-alike subdomain must not read as ours.
  const isManifoldUrl = (url: string) => {
    try {
      return new URL(url).origin === new URL(baseUri).origin
    } catch {
      return false
    }
  }

  // Pending 'nativeFbUser' posts, kept so a sign-out (or a switch to another
  // account) can cancel them. A late post would otherwise hand the OLD user back
  // to the web, which re-signs it in and echoes it to native as 'users' —
  // undoing the sign-out, and for accounts the web auto-logs-out (banned or
  // deleted) doing so forever.
  const pendingAuthPosts = useRef<ReturnType<typeof setTimeout>[]>([])
  const cancelPendingAuthPosts = () => {
    pendingAuthPosts.current.forEach((timer) => clearTimeout(timer))
    pendingAuthPosts.current = []
  }

  // Sends the saved user to the web client to make the log in process faster
  const sendWebviewAuthInfo = (user: FirebaseUser) => {
    cancelPendingAuthPosts()
    // We use a timeout because sometimes the auth persistence manager is still undefined on the client side
    // Seems my iPhone 12 mini can regularly handle a shorter timeout
    const timeouts = [100, 500, 1000, 3000]
    pendingAuthPosts.current = timeouts.map((timeout) =>
      setTimeout(() => {
        // Stale: native signed out or switched accounts since this was queued.
        if (fbUserRef.current?.uid !== user.uid) return
        // Never post credentials into a third-party page.
        if (!isManifoldUrl(webviewUrl.current)) return
        communicateWithWebview('nativeFbUser', user)
      }, timeout)
    )
  }

  // This handoff is the channel by which the web client learns about a native
  // sign-in, and a dropped message strands the user on a logged-out page whose
  // login button signs them back out of native — an unrecoverable loop. A fresh
  // sign-in used to get a single un-retried post from AuthPage (a component the
  // sign-in itself unmounts), while only the restore-from-storage path got the
  // retries. Run it on every uid change so both paths get them; the web side
  // no-ops when the email already matches.
  useEffect(() => {
    if (fbUser) sendWebviewAuthInfo(fbUser)
    return cancelPendingAuthPosts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbUser?.uid])

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

    if (hasLoadedWebView && listeningToNative.current) {
      // Webview is ready — deliver immediately via message bridge
      communicateWithWebview('notification', notification)
      setEndpointWithNativeQuery(destination)
    } else if (Platform.OS === 'android') {
      // Android cold start: WebView ignores rapid source prop changes during
      // initial mount, so the destination URL gets silently dropped. Queue and
      // deliver via message bridge once the web app signals 'startedListening'.
      log('Queuing notification for delivery after webview is ready')
      pendingNotification.current = { notification, destination }
    } else {
      // iOS cold start: source prop changes are honored during mount, so the
      // original behavior works without the handshake delay.
      setEndpointWithNativeQuery(destination)
    }
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
    // The origin of the document that sent this message. Auth-sensitive handlers
    // gate on it so a third-party page loaded in the WebView (iDenfy, Stripe)
    // can't drive the credential handoff.
    const messageUrl = nativeEvent.url as string | undefined
    const { type, data: payload } = JSON.parse(data) as webToNativeMessage
    // We handle auth with a custom screen, so if the user sees a login button on the client, we're out of sync
    if (type === 'loginClicked') {
      // The web client only shows a login button when it thinks nobody is signed
      // in. If native still holds a session at that point, the handoff above
      // never landed — that's the login loop, seen from this side. We still sign
      // out (the user asked to log in, and this may be a deliberate account
      // switch), but record it so we can tell how often it actually happens.
      if (fbUser) {
        Sentry.captureMessage(
          'Web requested login while native was still signed in',
          { level: 'warning', tags: { authFlow: 'login-loop-suspected' } }
        )
      }
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
    } else if (type === 'setStreak') {
      // Mirror the streak snapshot into the shared App Group for the widget.
      // The payload carries no user id, so the most we can check is that we
      // still believe someone is signed in — enough to stop a push that was
      // already in flight from repopulating the widget after a sign-out.
      if (widgetUid.current) writeStreakWidget(payload as NativeStreakData)
    } else if (type === 'setQuests') {
      writeQuestWidget(payload as NativeQuestData)
    } else if (type === 'pinStreakWidget') {
      // Android only: show the system "add widget to home screen" dialog via our
      // native module. No-op on iOS (no such API) and on older builds that
      // predate the module (NativeModules.WidgetPin is then undefined).
      if (
        Platform.OS === 'android' &&
        NativeModules.WidgetPin?.pinStreakWidget
      ) {
        try {
          await NativeModules.WidgetPin.pinStreakWidget()
        } catch (e) {
          log('pinStreakWidget failed', e)
        }
      }
    }
    // Receiving cached firebase user from webview cache
    else if (type === 'users') {
      try {
        const fbUserAndPrivateUser = JSON.parse(payload)
        if (fbUserAndPrivateUser && fbUserAndPrivateUser.fbUser) {
          const fbUser = fbUserAndPrivateUser.fbUser as FirebaseUser
          const generation = authGeneration.current
          // We don't actually use the firebase auth for anything right now, but in case we do in the future...
          await setFirebaseUserViaJson(fbUser, app)
          // A sign-out landed while this echo was being applied, so it is stale.
          // Don't persist it, and undo the re-sign above — but ONLY if this stale
          // user is still the current firebase user. If a newer account signed in
          // during the await, leaving it alone is what keeps a global signOut from
          // clearing the account the user actually chose.
          if (generation !== authGeneration.current) {
            if (auth.currentUser?.uid === fbUser.uid)
              await signOutUsers(
                'Error undoing a users echo that raced a sign-out'
              )
            return
          }
          await storeData('user', fbUser)
          // Refresh the streak widget from the API on each (re)auth / app open.
          if (fbUser.uid) syncStreakFromApi(fbUser.uid)
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
      // Only re-hand credentials to a sender that is actually one of our pages.
      if (fbUser && (!messageUrl || isManifoldUrl(messageUrl)))
        sendWebviewAuthInfo(fbUser)
      // Deliver any notification that arrived during cold start
      if (pendingNotification.current) {
        const { notification, destination } = pendingNotification.current
        pendingNotification.current = null
        log('Delivering pending cold-start notification:', notification.reason)
        communicateWithWebview('notification', notification)
        setEndpointWithNativeQuery(destination)
      }
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
      const reason = payload?.reason
      communicateWithWebview('hasReviewAction', {
        hasAction,
        isAvailable,
        reason,
      })
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
    authGeneration.current += 1
    cancelPendingAuthPosts()
    try {
      await auth.signOut()
    } catch (err) {
      log(errorMessage, err)
    }
    setFbUser(null)
    widgetUid.current = null
    clearStreakWidget()
    clearQuestWidget()
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
          onNavigate={(url) => {
            webviewUrl.current = url
          }}
        />
      </SafeAreaView>
      {/*<ExportLogsButton />*/}
    </SafeAreaProvider>
  )
}
export default Sentry.wrap(App)
