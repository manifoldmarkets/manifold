import { ReactNode, createContext, useEffect, useState } from 'react'
import { onIdTokenChanged, updateCurrentUser } from 'firebase/auth'
import {
  UserAndPrivateUser,
  auth,
  listenForUser,
  listenForPrivateUser,
  getUserAndPrivateUser,
  setCachedReferralInfoForUser,
} from 'web/lib/firebase/users'
import { createUser } from 'web/lib/firebase/api'
import { randomString } from 'common/util/random'
import { identifyUser, setUserProperty } from 'web/lib/service/analytics'
import { useStateCheckEquality } from 'web/hooks/use-state-check-equality'
import { AUTH_COOKIE_NAME } from 'common/envs/constants'
import { setCookie } from 'web/lib/util/cookie'
import { FirebaseAuthInternal } from 'web/lib/firebase/server-auth'

// Either we haven't looked up the logged in user yet (undefined), or we know
// the user is not logged in (null), or we know the user is logged in.
export type AuthUser = undefined | null | UserAndPrivateUser

const TEN_YEARS_SECS = 60 * 60 * 24 * 365 * 10
const CACHED_USER_KEY = 'CACHED_USER_KEY_V2'

// Proxy localStorage in case it's not available (eg in incognito iframe)
const localStorage =
  typeof window !== 'undefined'
    ? window.localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }

const ensureDeviceToken = () => {
  let deviceToken = localStorage.getItem('device-token')
  if (!deviceToken) {
    deviceToken = randomString()
    localStorage.setItem('device-token', deviceToken)
  }
  return deviceToken
}

export const setUserCookie = (cookie: string | undefined) => {
  const data = setCookie(AUTH_COOKIE_NAME, cookie ?? '', [
    ['path', '/'],
    ['max-age', (cookie === undefined ? 0 : TEN_YEARS_SECS).toString()],
    ['samesite', 'lax'],
    ['secure'],
  ])
  document.cookie = data
}

export const AuthContext = createContext<AuthUser>(undefined)

export const setFbUser = async (deserializedUser: any) => {
  try {
    const clientAuth = auth as FirebaseAuthInternal
    const persistenceManager = clientAuth.persistenceManager
    const persistence = persistenceManager.persistence
    await persistence._set(persistenceManager.fullUserKey, deserializedUser)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const fbUser = (await persistenceManager.getCurrentUser())!
    await fbUser.getIdToken() // forces a refresh if necessary
    await updateCurrentUser(auth, fbUser)
  } catch (e) {
    // setShowData(e)
    ;(window as any).ReactNativeWebView.postMessage('error setting fb user')
    console.error('deserializing', e)
    return null
  }
}
export function AuthProvider(props: {
  children: ReactNode
  serverUser?: AuthUser
}) {
  const { children, serverUser } = props
  const [authUser, setAuthUser] = useStateCheckEquality<AuthUser>(serverUser)
  const [showData, setShowData] = useState<string | null>()
  const handleNativeMessage = (e: any) => {
    // const event = JSON.parse(e.data)
    // const data = event.data
    // console.log('got fbUser from native', data)
    // setShowData(JSON.stringify(fakeUser))
    setFbUser(fakeUser)
    ;(window as any).ReactNativeWebView.postMessage('set user on web')
    // const cred = OAuthCredential.fromJSON(data)
    // const cred = GoogleAuthProvider.credential(data)
    // if (cred) signInWithCredential(auth, cred)
  }
  useEffect(() => {
    // if ((window as any).isNative) {
    document.addEventListener('message', handleNativeMessage)
    window.addEventListener('message', handleNativeMessage)
    return () => {
      document.removeEventListener('message', handleNativeMessage)
      window.removeEventListener('message', handleNativeMessage)
    }
    // }
  }, [])

  useEffect(() => {
    if (serverUser === undefined) {
      const cachedUser = localStorage.getItem(CACHED_USER_KEY)
      setAuthUser(cachedUser && JSON.parse(cachedUser))
      if ((window as any).isNative) {
        // TODO: also communicate sign out
        // Post the message back to expo
        ;(window as any).ReactNativeWebView.postMessage(cachedUser)
      }
    }
  }, [setAuthUser, serverUser])

  useEffect(() => {
    if (authUser) {
      // Persist to local storage, to reduce login blink next time.
      // Note: Cap on localStorage size is ~5mb
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(authUser))
    } else if (authUser === null) {
      localStorage.removeItem(CACHED_USER_KEY)
    }
  }, [authUser])

  useEffect(() => {
    return onIdTokenChanged(
      auth,
      async (fbUser) => {
        if (fbUser) {
          setUserCookie(JSON.stringify(fbUser.toJSON()))
          let current = await getUserAndPrivateUser(fbUser.uid)
          if (!current.user || !current.privateUser) {
            const deviceToken = ensureDeviceToken()
            current = (await createUser({ deviceToken })) as UserAndPrivateUser
            setCachedReferralInfoForUser(current.user)
          }
          setAuthUser(current)
        } else {
          // User logged out; reset to null
          setUserCookie(undefined)
          setAuthUser(null)
        }
      },
      (e) => {
        console.error(e)
      }
    )
  }, [setAuthUser])

  const uid = authUser?.user.id
  useEffect(() => {
    if (uid) {
      identifyUser(uid)
      const userListener = listenForUser(uid, (user) => {
        setAuthUser((currAuthUser) =>
          currAuthUser && user ? { ...currAuthUser, user } : null
        )
      })
      const privateUserListener = listenForPrivateUser(uid, (privateUser) => {
        setAuthUser((currAuthUser) =>
          currAuthUser && privateUser ? { ...currAuthUser, privateUser } : null
        )
      })
      return () => {
        userListener()
        privateUserListener()
      }
    }
  }, [uid, setAuthUser])

  const username = authUser?.user.username
  useEffect(() => {
    if (username != null) {
      setUserProperty('username', username)
    }
  }, [username])

  if (showData) return <div>{showData}</div>
  return (
    <AuthContext.Provider value={authUser}>{children}</AuthContext.Provider>
  )
}

export const fakeUser = {
  uid: '6hHpzvRG0pMq8PNJs7RZj2qlZGn2',
  email: 'iansphilips@gmail.com',
  emailVerified: true,
  displayName: 'Ian Philips',
  isAnonymous: false,
  photoURL:
    'https://lh3.googleusercontent.com/a-/AOh14GhGa0Vhb3LTBXbd2fGfekbG5clPQSVe59Xh35CrKw=s96-c',
  providerData: [
    {
      providerId: 'google.com',
      uid: '104873811885476820901',
      displayName: 'Ian Philips',
      email: 'iansphilips@gmail.com',
      phoneNumber: null,
      photoURL:
        'https://lh3.googleusercontent.com/a/ALm5wu2L9687DDQ_ifWj1ByKV2fggze7MlFK_B8mFwcU-DY=s96-c',
    },
  ],
  stsTokenManager: {
    refreshToken:
      'AOEOulbccgCwkis-c7EXs3NHhAk5gHd2bKjBnI7XZNBho6cyqYwWM5LXBSX9O4Paut6-cJChJYcODG-btqbs7OfE58uIm-BixV0kgYJ8iZxRyUDvbNI0PfosDEoUvAR4D1jWvLca0Tjov_HfW9ZREWWuJCh9vw0unNdAXDjwkjhpRtp5HYB8khGeD2VVuZYDBEj0v8U1iSFI0yvYjCEnlB-DRN0cYSwZFCavTRji_wnW7Ks9x4OWqrs1uOk0z3QEDJeRePe9gzUG_RXV1sbkz3z5WC6meQVLblh8MrMDZ3FNlWjb-N8XdB4RwbHSCZ7SOt6_E9omxupCSoFmZBWg9Ad5_qoC3oWpRR8tdEu7CTNT9DV1yGhWYKAzSp-MUJEzzVNqy72tjdVQMfyOfAfjPpMbOyi8uHpdRSgERJ3myNmurrhTDQNTZpY',
    accessToken:
      'eyJhbGciOiJSUzI1NiIsImtpZCI6Ijk5NjJmMDRmZWVkOTU0NWNlMjEzNGFiNTRjZWVmNTgxYWYyNGJhZmYiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiSWFuIFBoaWxpcHMiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EtL0FPaDE0R2hHYTBWaGIzTFRCWGJkMmZHZmVrYkc1Y2xQUVNWZTU5WGgzNUNyS3c9czk2LWMiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vZGV2LW1hbnRpYy1tYXJrZXRzIiwiYXVkIjoiZGV2LW1hbnRpYy1tYXJrZXRzIiwiYXV0aF90aW1lIjoxNjY1NzUwMDc0LCJ1c2VyX2lkIjoiNmhIcHp2UkcwcE1xOFBOSnM3UlpqMnFsWkduMiIsInN1YiI6IjZoSHB6dlJHMHBNcThQTkpzN1JaajJxbFpHbjIiLCJpYXQiOjE2NjU3NTAwNzQsImV4cCI6MTY2NTc1MzY3NCwiZW1haWwiOiJpYW5zcGhpbGlwc0BnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJnb29nbGUuY29tIjpbIjEwNDg3MzgxMTg4NTQ3NjgyMDkwMSJdLCJlbWFpbCI6WyJpYW5zcGhpbGlwc0BnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJnb29nbGUuY29tIn19.U0dnyvSJd0ErV1iZU-feJwgjE3H2oybJF9dUmCf7IJGVAv5bXy8_GhWPVJeUQQ2ne-VErgmxziN4aOQ09Y6nRCFov-QTVC1KlN2oV9QB2pWsya-r_e0rsSO2BNcEQHuw9ju_H65LqOAp-oM1Rmsej7OHv6uGL-q35qnUIsnvkqL9oKSiG4A87L_iApGcw3ixqxXppMAG54bkevpKLKZvdEKxCdp7aMyn-kipkx3YvCA8NRzS_f6oxwF6koSjnEmJLxtdHvoYfsLjAgZvcnRPu7API52-Qi5NGqJn9rbabywf87GeSZbAL22xpkrzfqH8Lw_dGhgTZhPsZ4R6n5OaMQ',
    expirationTime: 1665753674429,
  },
  createdAt: '1650038386755',
  lastLoginAt: '1665704537930',
  apiKey: 'AIzaSyBoq3rzUa8Ekyo3ZaTnlycQYPRCA26VpOw',
  appName: '[DEFAULT]',
}
