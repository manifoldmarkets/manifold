import { Auth, getAuth } from 'firebase/auth'
import { app } from './init'

let auth: Auth | null = null

export const getFirebaseAuth = () => {
  if (!auth) {
    auth = getAuth(app)
  }
  return auth
}
