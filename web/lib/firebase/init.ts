import { getStorage } from 'firebase/storage'
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { FIREBASE_CONFIG } from 'common/envs/constants'

// Initialize Firebase
export const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)

function iOS() {
  if (typeof navigator === 'undefined') {
    // We're on the server, proceed normally
    return false
  }
  return (
    [
      'iPad Simulator',
      'iPhone Simulator',
      'iPod Simulator',
      'iPad',
      'iPhone',
      'iPod',
    ].includes(navigator.platform) ||
    // iPad on iOS 13 detection
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
  )
}
// Long polling is necessary for ios, see: https://github.com/firebase/firebase-js-sdk/issues/6118
const opts = iOS() ? { experimentalForceLongPolling: true } : {}
export const db = initializeFirestore(app, opts)

export const functions = getFunctions()
export const storage = getStorage()

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
