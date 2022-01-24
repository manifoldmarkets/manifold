import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  query,
  where,
  limit,
  getDocs,
  orderBy,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { ref, getStorage, uploadBytes, getDownloadURL } from 'firebase/storage'
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'

import { app } from './init'
import { PrivateUser, User } from '../../../common/user'
import { createUser } from './api-call'
import { getValues, listenForValues } from './utils'
export type { User }

const db = getFirestore(app)
export const auth = getAuth(app)

export async function getUser(userId: string) {
  const docSnap = await getDoc(doc(db, 'users', userId))
  return docSnap.data() as User
}

export async function getUserByUsername(username: string) {
  // Find a user whose username matches the given username, or null if no such user exists.
  const userCollection = collection(db, 'users')
  const q = query(userCollection, where('username', '==', username), limit(1))
  const docs = await getDocs(q)
  const users = docs.docs.map((doc) => doc.data() as User)
  return users[0] || null
}

export async function setUser(userId: string, user: User) {
  await setDoc(doc(db, 'users', userId), user)
}

export function listenForUser(userId: string, setUser: (user: User) => void) {
  const userRef = doc(db, 'users', userId)
  return onSnapshot(userRef, (userSnap) => {
    setUser(userSnap.data() as User)
  })
}

const CACHED_USER_KEY = 'CACHED_USER_KEY'

// used to avoid weird race condition
let createUserPromise: Promise<User | null> | undefined = undefined

export function listenForLogin(onUser: (user: User | null) => void) {
  const cachedUser = localStorage.getItem(CACHED_USER_KEY)
  onUser(cachedUser ? JSON.parse(cachedUser) : null)

  if (!cachedUser) createUser() // warm up cloud function

  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      let user: User | null = await getUser(fbUser.uid)

      if (!user) {
        if (!createUserPromise) {
          createUserPromise = createUser()
        }
        user = (await createUserPromise) || null
      }

      onUser(user)

      // Persist to local storage, to reduce login blink next time.
      // Note: Cap on localStorage size is ~5mb
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user))
    } else {
      // User logged out; reset to null
      onUser(null)
      localStorage.removeItem(CACHED_USER_KEY)
      createUserPromise = undefined
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

export async function listAllUsers() {
  const userCollection = collection(db, 'users')
  const q = query(userCollection)
  const docs = await getDocs(q)
  return docs.docs.map((doc) => doc.data() as User)
}

export function listenForAllUsers(setUsers: (users: User[]) => void) {
  const userCollection = collection(db, 'users')
  const q = query(userCollection)
  listenForValues(q, setUsers)
}

export function listenForPrivateUsers(
  setUsers: (users: PrivateUser[]) => void
) {
  const userCollection = collection(db, 'private-users')
  const q = query(userCollection)
  listenForValues(q, setUsers)
}

const topTradersQuery = query(
  collection(db, 'users'),
  orderBy('totalPnLCached', 'desc'),
  limit(21)
)

export async function getTopTraders() {
  const users = await getValues<User>(topTradersQuery)
  return users.filter((user) => user.username !== 'SG').slice(0, 20)
}

const topCreatorsQuery = query(
  collection(db, 'users'),
  orderBy('creatorVolumeCached', 'desc'),
  limit(20)
)

export function getTopCreators() {
  return getValues<User>(topCreatorsQuery)
}
