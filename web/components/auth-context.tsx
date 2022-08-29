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
import { deleteTokenCookies, setTokenCookies } from 'web/lib/firebase/auth'
import { createUser } from 'web/lib/firebase/api'
import { randomString } from 'common/util/random'
import { identifyUser, setUserProperty } from 'web/lib/service/analytics'
import { useStateCheckEquality } from 'web/hooks/use-state-check-equality'

// Either we haven't looked up the logged in user yet (undefined), or we know
// the user is not logged in (null), or we know the user is logged in.
type AuthUser = undefined | null | UserAndPrivateUser

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

export const AuthContext = createContext<AuthUser>(undefined)

export function AuthProvider(props: {
  children: ReactNode
  serverUser?: AuthUser
}) {
  const { children, serverUser } = props
  const [authUser, setAuthUser] = useStateCheckEquality<AuthUser>(serverUser)

  useEffect(() => {
    if (serverUser === undefined) {
      const cachedUser = localStorage.getItem(CACHED_USER_KEY)
      setAuthUser(cachedUser && JSON.parse(cachedUser))
    }
  }, [setAuthUser, serverUser])

  useEffect(() => {
    return onIdTokenChanged(auth, async (fbUser) => {
      console.log('onIdTokenChanged', fbUser)
      if (fbUser) {
        setTokenCookies({
          id: await fbUser.getIdToken(),
          refresh: fbUser.refreshToken,
        })
        let current = await getUserAndPrivateUser(fbUser.uid)
        if (!current.user || !current.privateUser) {
          const deviceToken = ensureDeviceToken()
          current = (await createUser({ deviceToken })) as UserAndPrivateUser
        }
        setAuthUser(current)
        // Persist to localStorage, to reduce login blink next time.
        // Note: Cap on localStorage size is ~5mb
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(current))
        setCachedReferralInfoForUser(current.user)
      } else {
        // User logged out; reset to null
        deleteTokenCookies()
        setAuthUser(null)
        localStorage.removeItem(CACHED_USER_KEY)
      }
    })
  }, [setAuthUser])

  const uid = authUser?.user.id
  const username = authUser?.user.username
  useEffect(() => {
    if (uid && username) {
      identifyUser(uid)
      setUserProperty('username', username)
      const userListener = listenForUser(uid, (user) =>
        setAuthUser((authUser) => {
          /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
          return { ...authUser!, user: user! }
        })
      )
      const privateUserListener = listenForPrivateUser(uid, (privateUser) => {
        setAuthUser((authUser) => {
          /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
          return { ...authUser!, privateUser: privateUser! }
        })
      })
      return () => {
        userListener()
        privateUserListener()
      }
    }
  }, [uid, username, setAuthUser])

  return (
    <AuthContext.Provider value={authUser}>{children}</AuthContext.Provider>
  )
}
