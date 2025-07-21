import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage'
import { CONFIGS } from 'common/envs/constants'
import { log } from 'components/logger'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getReactNativePersistence, initializeAuth } from 'firebase/auth'

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
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

log('using', ENV, 'env')
log('env not switching? run `npx expo start --clear` and then try again')
