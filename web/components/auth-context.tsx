import { createContext, ReactNode, useEffect } from 'react'
import { pickBy } from 'lodash'
import { onIdTokenChanged } from 'firebase/auth'
import {
  auth,
  getUserAndPrivateUser,
  listenForPrivateUser,
  listenForUser,
  setCachedReferralInfoForUser,
} from 'web/lib/firebase/users'
import { createUser } from 'web/lib/firebase/api'
import { randomString } from 'common/util/random'
import { identifyUser, setUserProperty } from 'web/lib/service/analytics'
import { useStateCheckEquality } from 'web/hooks/use-state-check-equality'
import { AUTH_COOKIE_NAME, TEN_YEARS_SECS } from 'common/envs/constants'
import { setCookie } from 'web/lib/util/cookie'
import { UserAndPrivateUser } from 'common/user'
import {
  webviewPassUsers,
  webviewSignOut,
} from 'web/lib/native/webview-messages'

// Either we haven't looked up the logged in user yet (undefined), or we know
// the user is not logged in (null), or we know the user is logged in.
export type AuthUser = undefined | null | UserAndPrivateUser
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

const stripUserData = (data: string) => {
  // there's some risk that this cookie could be too big for some clients,
  // so strip it down to only the keys that the server auth actually needs
  // in order to auth to the firebase SDK
  const whitelist = ['uid', 'emailVerified', 'isAnonymous', 'stsTokenManager']
  const user = JSON.parse(data)
  const stripped = pickBy(user, (_v, k) => whitelist.includes(k))
  return JSON.stringify(stripped)
}

export const setUserCookie = (data: string | undefined) => {
  const stripped = data ? stripUserData(data) : ''
  const cookie = setCookie(AUTH_COOKIE_NAME, stripped, [
    ['path', '/'],
    ['max-age', (data === undefined ? 0 : TEN_YEARS_SECS).toString()],
    ['samesite', 'lax'],
    ['secure'],
  ])
  document.cookie = cookie
}

export const AuthContext = createContext<AuthUser>(undefined)
export function AuthProvider(props: {
  children: ReactNode
  serverUser?: AuthUser
}) {
  const { children, serverUser } = props
  const [authUser, setAuthUser] = useStateCheckEquality<AuthUser>(serverUser)

  console.log(serverUser)
  useEffect(() => {
    if (serverUser === undefined) {
      const cachedUser = localStorage.getItem(CACHED_USER_KEY)
      const parsed = cachedUser ? JSON.parse(cachedUser) : null
      if (parsed) {
        // Temporary: only set auth user if private user has blockedUserIds.
        if (parsed.privateUser && parsed.privateUser.blockedUserIds)
          setAuthUser(parsed)
      } else setAuthUser(null)
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
          webviewPassUsers(
            JSON.stringify({
              fbUser: fbUser.toJSON(),
              privateUser: current.privateUser,
            })
          )
        } else {
          // User logged out; reset to null
          setUserCookie(undefined)
          setAuthUser(null)
          webviewSignOut()
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
