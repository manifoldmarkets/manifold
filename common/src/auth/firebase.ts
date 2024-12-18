import { Auth } from 'firebase/auth'

export interface FirebaseAuthMethods {
  getFirebaseAuth: () => Auth
}

export function createFirebaseAuth(platform: FirebaseAuthMethods) {
  return platform.getFirebaseAuth()
}
