import 'expo-dev-client'
import * as Notifications from 'expo-notifications'
import { User as FirebaseUser } from 'firebase/auth'
import React, { useEffect, useRef, useState } from 'react'
import { Dimensions, Platform, SafeAreaView } from 'react-native'
import { app, auth, ENV } from './init'
// @ts-ignore
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import { Notification } from 'common/notification'
import { IosIapListener } from 'components/ios-iap-listener'
import * as Linking from 'expo-linking'
import { Subscription } from 'expo-modules-core'
import { StatusBar } from 'expo-status-bar'
import { withIAPContext } from 'react-native-iap'

import { ReadexPro_400Regular, useFonts } from '@expo-google-fonts/readex-pro'
import * as Sentry from '@sentry/react-native'
import { log } from 'components/logger'
import { SplashAuth } from 'components/splash-auth'
import Constants from 'expo-constants'
import { getData } from 'lib/auth'
import { useIsConnected } from 'lib/use-is-connected'

Sentry.init({
  dsn: 'https://2353d2023dad4bc192d293c8ce13b9a1@o4504040581496832.ingest.us.sentry.io/4504040585494528',
  debug: ENV === 'DEV',
})
// NOTE: you must change NEXT_PUBLIC_API_URL in dev.sh to match your local IP address. ie:
// "cross-env NEXT_PUBLIC_API_URL=192.168.1.229:8088 \
// Then, set the native url in the app on the user settings page: http://192.168.1.229:3000/

const isIOS = Platform.OS === 'ios'
const App = () => {
  // Init
  const notificationResponseListener = useRef<Subscription>()
  useFonts({ ReadexPro_400Regular })

  // Auth
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(auth.currentUser)
  // Auth.currentUser didn't update, so we track the state manually
  auth.onAuthStateChanged((user) => (user ? setFbUser(user) : null))

  const signInUserFromStorage = async () => {
    const user = await getData<FirebaseUser>('user')
    if (!user) return
    log('Got user from storage:', user.email)
    setFbUser(user)
    await setFirebaseUserViaJson(user, app)
  }

  useEffect(() => {
    signInUserFromStorage()
  }, [])

  // IAP
  const [checkoutAmount, setCheckoutAmount] = useState<number | null>(null)

  const handlePushNotification = async (
    response: Notifications.NotificationResponse
  ) => {
    // Perhaps this isn't current if the webview is killed for memory collection? Not sure
    const notification = response.notification.request.content
      .data as Notification
    log('notification', notification)
    if (notification == undefined) return
  }

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
  }, [])

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      log('Initial url:', url, '- has loaded webview:')
    })
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

  const isConnected = useIsConnected()
  const fullyLoaded = fbUser && isConnected

  const width = Dimensions.get('window').width //full width
  const height = Dimensions.get('window').height //full height

  return (
    <>
      <SplashAuth
        height={height}
        width={width}
        source={require('./assets/splash.png')}
        fbUser={fbUser}
        isConnected={isConnected}
      />
      {Platform.OS === 'ios' && fullyLoaded && (
        <IosIapListener
          checkoutAmount={checkoutAmount}
          setCheckoutAmount={setCheckoutAmount}
        />
      )}

      <SafeAreaView
      // style={styles.container}
      >
        <StatusBar animated={true} style={'dark'} hidden={false} />
      </SafeAreaView>
      {/*<ExportLogsButton />*/}
    </>
  )
}
export default Sentry.wrap(withIAPContext(App))
