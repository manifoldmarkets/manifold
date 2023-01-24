import { getApp, getApps, initializeApp } from 'firebase/app'
import { FIREBASE_CONFIG } from 'common/envs/constants'
import { getAuth } from 'firebase/auth'

export const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
export const auth = getAuth(app)
export const log = (...args: unknown[]) => {
  console.log(`[Manifold Markets]`, ...args)
}
