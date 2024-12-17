import { getApp, getApps, initializeApp } from 'firebase/app'
import { CONFIGS } from 'common/envs/constants'
import { initializeAuth, getReactNativePersistence } from 'firebase/auth'
import * as Notifications from 'expo-notifications'
import { log } from 'components/logger'
import Constants from 'expo-constants'
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage'

export const ENV =
  Constants.expoConfig?.extra?.eas.NEXT_PUBLIC_FIREBASE_ENV ?? 'PROD'
export const app = getApps().length
  ? getApp()
  : initializeApp(CONFIGS[ENV].firebaseConfig)
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
})

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

log('using', ENV, 'env')
log('env not switching? run `npx expo start --clear` and then try again')
