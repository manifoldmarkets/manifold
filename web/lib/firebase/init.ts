import { getFirestore } from '@firebase/firestore'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { FIREBASE_CONFIG } from '../../../common/access'

const ENV = process.env.NEXT_PUBLIC_FIREBASE_ENV ?? 'PROD'
// TODO: Move this to access.ts
export const IS_PRIVATE_MANIFOLD = !['PROD', 'DEV'].includes(ENV)
// Initialize Firebase
export const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)

export const db = getFirestore(app)
