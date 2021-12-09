import { app } from './init'
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { ref, getStorage, uploadBytes, getDownloadURL } from 'firebase/storage'
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'

export type User = {
  id: string
  email: string
  name: string
  username: string
  avatarUrl: string
  balanceUsd: number
  createdTime: number
  lastUpdatedTime: number
}

const db = getFirestore(app)
export const auth = getAuth(app)

export async function getUser(userId: string) {
  const docSnap = await getDoc(doc(db, 'users', userId))
  return docSnap.data() as User
}

export async function setUser(userId: string, user: User) {
  await setDoc(doc(db, 'users', userId), user)
}

const CACHED_USER_KEY = 'CACHED_USER_KEY'
export function listenForLogin(onUser: (_user: User) => void) {
  // Immediately load any persisted user object from browser cache.
  const cachedUser = localStorage.getItem(CACHED_USER_KEY)
  if (cachedUser) {
    onUser(JSON.parse(cachedUser))
  }

  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      let fetchedUser = await getUser(user.uid)
      if (!fetchedUser) {
        // User just created an account; save them to our database.
        fetchedUser = {
          id: user.uid,
          name: user.displayName || 'Default Name',
          username: user.displayName?.replace(/\s+/g, '') || 'DefaultUsername',
          avatarUrl: user.photoURL || '',
          email: user.email || 'default@blah.com',
          balanceUsd: 10000,
          // TODO: use Firestore timestamp?
          createdTime: Date.now(),
          lastUpdatedTime: Date.now(),
        }
        await setUser(user.uid, fetchedUser)
      }
      onUser(fetchedUser)

      // Persist to local storage, to reduce login blink next time.
      // Note: Cap on localStorage size is ~5mb
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(fetchedUser))
    } else {
      // User logged out; reset to the empty object
      onUser({} as User)
      localStorage.removeItem(CACHED_USER_KEY)
    }
  })
}

export async function firebaseLogin() {
  const provider = new GoogleAuthProvider()
  signInWithPopup(auth, provider)
}

export async function firebaseLogout() {
  auth.signOut()
}

const storage = getStorage(app)
// Example: uploadData('avatars/ajfi8iejsf.png', data)
export async function uploadData(
  path: string,
  data: ArrayBuffer | Blob | Uint8Array
) {
  const uploadRef = ref(storage, path)
  // Uploaded files should be cached for 1 day, then revalidated
  // See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
  const metadata = { cacheControl: 'public, max-age=86400, must-revalidate' }
  await uploadBytes(uploadRef, data, metadata)
  return await getDownloadURL(uploadRef)
}
