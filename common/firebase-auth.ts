import { FirebaseApp } from '@firebase/app'
import {
  Auth as FirebaseAuth,
  getAuth,
  updateCurrentUser,
  User as FirebaseUser,
} from 'firebase/auth'

export interface FirebaseAuthInternal extends FirebaseAuth {
  persistenceManager: {
    fullUserKey: string
    getCurrentUser: () => Promise<FirebaseUser | null>
    persistence: {
      _set: (k: string, obj: FirebaseUser) => Promise<void>
    }
  }
}

export const setFirebaseUserViaJson = async (
  deserializedUser: FirebaseUser,
  app: FirebaseApp
) => {
  try {
    if (typeof window !== 'undefined') {
      //eslint-disable-next-line
      ;(window as any).isNative &&
        (window as any).ReactNativeWebView.postMessage('received fbUser')
    }
    const clientAuth = getAuth(app) as FirebaseAuthInternal
    const persistenceManager = clientAuth.persistenceManager
    const persistence = persistenceManager.persistence
    await persistence._set(persistenceManager.fullUserKey, deserializedUser)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const fbUser = (await persistenceManager.getCurrentUser())!
    await fbUser?.getIdToken() // forces a refresh if necessary
    await updateCurrentUser(clientAuth, fbUser)
    return fbUser
  } catch (e) {
    if (typeof window !== 'undefined') {
      //eslint-disable-next-line
      ;(window as any).isNative &&
        (window as any).ReactNativeWebView.postMessage(
          `error setting fb user ${e}`
        )
    }
    console.error('deserializing', e)
    return null
  }
}
