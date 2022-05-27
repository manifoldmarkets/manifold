import { getFirestore } from '@firebase/firestore'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { FIREBASE_CONFIG } from 'common/envs/constants'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

// Initialize Firebase
export const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
export const db = getFirestore()
export const functions = getFunctions()

declare global {
  /* eslint-disable-next-line no-var */
  var EMULATORS_STARTED: boolean
}

function startEmulators() {
  // I don't like this but this is the only way to reconnect to the emulators without error, see: https://stackoverflow.com/questions/65066963/firebase-firestore-emulator-error-host-has-been-set-in-both-settings-and-usee
  if (!global.EMULATORS_STARTED) {
    global.EMULATORS_STARTED = true
    connectFirestoreEmulator(db, 'localhost', 8080)
    connectFunctionsEmulator(functions, 'localhost', 5001)
  }
}

if (process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
  startEmulators()
}
