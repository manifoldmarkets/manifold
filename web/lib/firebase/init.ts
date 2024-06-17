import { getStorage } from 'firebase/storage'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { FIREBASE_CONFIG } from 'common/envs/constants'

// Initialize Firebase
export const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
export const storage = getStorage()
