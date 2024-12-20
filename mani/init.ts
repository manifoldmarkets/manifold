import * as Notifications from 'expo-notifications'
import { log } from 'components/logger'
import { getFirebaseAuth } from 'lib/firebase/auth'
import { getApps, getApp, initializeApp } from 'firebase/app'
import { CONFIGS } from 'common/envs/constants'
import Constants from 'expo-constants'

export const ENV =
  Constants.expoConfig?.extra?.eas.NEXT_PUBLIC_FIREBASE_ENV ?? 'PROD'
export const app = getApps().length
  ? getApp()
  : initializeApp(CONFIGS[ENV].firebaseConfig)

export const auth = getFirebaseAuth()

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

// log('using', ENV, 'env')
log('env not switching? run `npx expo start --clear` and then try again')
