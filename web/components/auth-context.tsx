import { ReactNode, createContext, useEffect } from 'react'
import { onIdTokenChanged } from 'firebase/auth'
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
  const [authUser, setAuthUser] = useStateCheckEquality<AuthUser>(
    serverUser ?? getStoredUser()
  )

  useEffect(() => {
    if (authUser != null) {
      // Persist to local storage, to reduce login blink next time.
      // Note: Cap on localStorage size is ~5mb
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(authUser))
    } else {
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

  return (
    <AuthContext.Provider value={authUser}>{children}</AuthContext.Provider>
  )
}

const getStoredUser = () => {
  if (typeof window === 'undefined') return undefined

  const json = localStorage.getItem(CACHED_USER_KEY)
  return json ? JSON.parse(json) : undefined
}
