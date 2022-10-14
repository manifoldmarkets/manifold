import { ReactNode, createContext, useEffect } from 'react'
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithCredential,
  signInWithCustomToken,
  updateCurrentUser,
} from 'firebase/auth'
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

export function AuthProvider(props: {
  children: ReactNode
  serverUser?: AuthUser
}) {
  const { children, serverUser } = props
  const [authUser, setAuthUser] = useStateCheckEquality<AuthUser>(serverUser)

  const handleNativeMessage = (e: any) => {
    try {
      const event = JSON.parse(e.data)
      const data = event.data
      setFbUser(data)
      // signInWithIdToken(data)
      // signInWithToken(data)
    } catch (e) {
      console.log('error parsing native message', e)
      return
    }
    // const cred = OAuthCredential.fromJSON(data)
    // const cred = GoogleAuthProvider.credential(data)
    // if (cred) signInWithCredential(auth, cred)
  }
  const signInWithIdToken = async (token: any) => {
    ;(window as any).ReactNativeWebView.postMessage('received credential!')
    const credential = GoogleAuthProvider.credential(token)
    await signInWithCredential(auth, credential)
  }
  const signInWithToken = async (token: any) => {
    ;(window as any).ReactNativeWebView.postMessage('received custom token!')
    await signInWithCustomToken(
      auth,
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL2lkZW50aXR5dG9vbGtpdC5nb29nbGVhcGlzLmNvbS9nb29nbGUuaWRlbnRpdHkuaWRlbnRpdHl0b29sa2l0LnYxLklkZW50aXR5VG9vbGtpdCIsImlhdCI6MTY2NTc1OTIzNSwiZXhwIjoxNjY1NzYyODM1LCJpc3MiOiJmaXJlYmFzZS1hZG1pbnNkay1zaXI1bUBkZXYtbWFudGljLW1hcmtldHMuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLCJzdWIiOiJmaXJlYmFzZS1hZG1pbnNkay1zaXI1bUBkZXYtbWFudGljLW1hcmtldHMuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLCJ1aWQiOiI2aEhwenZSRzBwTXE4UE5KczdSWmoycWxaR24yIn0.OP3RlXe8JXicZFzT6oQu0DrmsfrHewk2kSRsY0RMvkSl7NxXaX7JOhcZqoFAtOuk7Mk8XxRPKsfFBovjsG5r42WzoY6pCwu1t9QWxZS8uxmhMOPnsUd0dWWOCU2Fy4HqYtc39plz9i2tMNsGNyl93VWondmxh-xQLpddSGre3jyahHYRehGneaYxurcw9JAP41D4f9oIJsXcbpUs9dVYRJDGH-bkuKZpbfdR6ZOLU9uNEQfjDfXsgz0HXsNzBo56gXVtlMkmv0V9Y4dYx4T8rdrBxJ1sLwmK6poOcIloWzyr-cSigfv7mqiGhvyty8O5ixu8McyD4kmwEzVb6-PJwg'
    )
  }

  const setFbUser = async (deserializedUser: any) => {
    try {
      ;(window as any).ReactNativeWebView.postMessage('received fbUser')
      const clientAuth = auth as FirebaseAuthInternal
      const persistenceManager = clientAuth.persistenceManager
      const persistence = persistenceManager.persistence
      await persistence._set(persistenceManager.fullUserKey, deserializedUser)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const fbUser = (await persistenceManager.getCurrentUser())!
      ;(window as any).ReactNativeWebView.postMessage(`called fbuser ${fbUser}`)
      await fbUser?.getIdToken() // forces a refresh if necessary
      await updateCurrentUser(auth, fbUser)
    } catch (e) {
      ;(window as any).ReactNativeWebView.postMessage(
        `error setting fb user ${e}`
      )
      console.error('deserializing', e)
      return null
    }
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

  const uid = authUser ? authUser.user.id : authUser
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
    } else if (uid === null) {
      identifyUser(null)
    }
  }, [uid, setAuthUser])

  const username = authUser?.user.username
  useEffect(() => {
    if (username != null) {
      setUserProperty('username', username)
    }
  }, [username])

  return (
    <AuthContext.Provider value={authUser}>{children}</AuthContext.Provider>
  )
}
