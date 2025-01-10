import 'react-native-get-random-values'
import * as Notifications from 'expo-notifications'
import { log } from 'components/logger'
import { getApps, getApp, initializeApp, FirebaseApp } from 'firebase/app'
import { CONFIGS } from 'common/envs/constants'
import Constants from 'expo-constants'
import { Auth, initializeAuth, getReactNativePersistence } from 'firebase/auth'
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage'
import { getStorage } from 'firebase/storage'

export const ENV =
  Constants.expoConfig?.extra?.eas.NEXT_PUBLIC_FIREBASE_ENV ?? 'PROD'
export const ENV_CONFIG = CONFIGS[ENV]
export const isProd = ENV === 'PROD'
export const app = getApps().length
  ? getApp()
  : initializeApp(ENV_CONFIG.firebaseConfig)
let initAuth: Auth | null = null

export const getAuth = (app: FirebaseApp) => {
  if (!initAuth) {
    initAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    })
  }
  return initAuth
}
export const auth = getAuth(app)

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})
export const storage = getStorage()
export const privateStorage = getStorage(
  app,
  'gs://' + ENV_CONFIG.firebaseConfig.privateBucket
)

log('using', ENV, 'env')
log('env not switching? run `npx expo start --clear` and then try again')
