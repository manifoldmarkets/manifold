/* eslint-disable @typescript-eslint/no-require-imports */
import 'expo-dev-client'
import * as Notifications from 'expo-notifications'
import { useEffect, useRef } from 'react'
import { Dimensions, Platform, SafeAreaView } from 'react-native'
import { ENV } from 'lib/firebase/init'
import { Notification } from 'common/notification'
import { withIAPContext } from 'react-native-iap'
import * as Sentry from '@sentry/react-native'
import { log } from 'components/logger'
import { useFonts } from '@expo-google-fonts/readex-pro'
import { useIsConnected } from 'lib/use-is-connected'
import { TokenModeProvider } from 'hooks/use-token-mode'
import { Stack } from 'expo-router'
import Constants from 'expo-constants'
import { StyleSheet } from 'react-native'
import { Colors } from 'constants/colors'
import { UserProvider, useUser } from 'hooks/use-user'
import { Splash } from 'components/splash'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import { AuthPage } from 'components/auth-page'
import { ToastProvider } from 'react-native-toast-notifications'
import { RootSiblingParent } from 'react-native-root-siblings'

const HEADER_HEIGHT = 250

// Initialize Sentry
Sentry.init({
  dsn:
    ENV === 'DEV'
      ? ''
      : 'https://2353d2023dad4bc192d293c8ce13b9a1@o4504040581496832.ingest.us.sentry.io/4504040585494528',
})

function RootLayout() {
  const notificationResponseListener =
    useRef<Notifications.EventSubscription>(undefined)
  const [loaded] = useFonts({
    JetBrainsMono: require('../assets/fonts/JetBrainsMono[wght].ttf'),
    JetBrainsMonoItalic: require('../assets/fonts/JetBrainsMono-Italic[wght].ttf'),
    Figtree: require('../assets/fonts/Figtree-VariableFont_wght.ttf'),
    FigtreeItalic: require('../assets/fonts/Figtree-Italic-VariableFont_wght.ttf'),
  })

  const user = useUser()

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
      if (notificationResponseListener.current) {
        Notifications.removeNotificationSubscription(
          notificationResponseListener.current
        )
      }
    }
  }, [])

  // useEffect(() => {
  //   Linking.getInitialURL().then((url) => {
  //     log('Initial url:', url)
  //   })
  // }, [])

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
  useEffect(() => {
    if (!isConnected) {
      alert("You're offline. Please reconnect to the internet to use Sweeple.")
    }
  }, [isConnected])
  const width = Dimensions.get('window').width //full width
  const height = Dimensions.get('window').height //full height
  const insets = useSafeAreaInsets()
  return (
    <SafeAreaView
      style={[
        styles.container,
        // Add padding for Android
        Platform.OS === 'android' && {
          paddingTop: insets.bottom + insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {!loaded ? (
        <Splash
          height={height + insets.bottom}
          width={width}
          source={require('../assets/images/splash.png')}
        />
      ) : user === null ? (
        <AuthPage height={height} width={width} />
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="[username]" />
          <Stack.Screen name="[username]/[contractSlug]" />
          <Stack.Screen name="register" />
          <Stack.Screen name="redeem" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="account-settings" />
          <Stack.Screen name="+not-found" />
        </Stack>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Platform.OS === 'ios' ? 20 : 0,
  },
  header: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    gap: 16,
    overflow: 'hidden',
  },
})

// export default Sentry.wrap(withIAPContext(RootLayout))
export default function App() {
  const WrappedRoot = Sentry.wrap(withIAPContext(RootLayout))

  return (
    <ToastProvider
      placement="top"
      successColor={Colors.background}
      warningColor={Colors.background}
      dangerColor={Colors.background}
    >
      <UserProvider>
        <TokenModeProvider>
          <RootSiblingParent>
            <SafeAreaProvider>
              <WrappedRoot />
            </SafeAreaProvider>
          </RootSiblingParent>
        </TokenModeProvider>
      </UserProvider>
    </ToastProvider>
  )
}
