import { Auth, initializeAuth, getReactNativePersistence } from 'firebase/auth'
import { app } from '../../init'
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage'

let auth: Auth | null = null

export const getFirebaseAuth = () => {
  if (!auth) {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    })
  }
  return auth
}
