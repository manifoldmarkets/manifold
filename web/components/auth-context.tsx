import { createContext, useEffect } from 'react'
import { User } from 'common/user'
import { onIdTokenChanged } from 'firebase/auth'
import {
  auth,
  listenForUser,
  getUser,
  setCachedReferralInfoForUser,
} from 'web/lib/firebase/users'
import { deleteAuthCookies, setAuthCookies } from 'web/lib/firebase/auth'
import { createUser } from 'web/lib/firebase/api'
import { randomString } from 'common/util/random'
import { identifyUser, setUserProperty } from 'web/lib/service/analytics'
import { useStateCheckEquality } from 'web/hooks/use-state-check-equality'

// Either we haven't looked up the logged in user yet (undefined), or we know
// the user is not logged in (null), or we know the user is logged in (User).
type AuthUser = undefined | null | User

const CACHED_USER_KEY = 'CACHED_USER_KEY'

const ensureDeviceToken = () => {
  let deviceToken = localStorage.getItem('device-token')
  if (!deviceToken) {
    deviceToken = randomString()
    localStorage.setItem('device-token', deviceToken)
  }
  return deviceToken
}

export const AuthContext = createContext<AuthUser>(null)

export function AuthProvider({ children }: any) {
  const [authUser, setAuthUser] = useStateCheckEquality<AuthUser>(undefined)

  useEffect(() => {
    const cachedUser = localStorage.getItem(CACHED_USER_KEY)
    setAuthUser(cachedUser && JSON.parse(cachedUser))
  }, [setAuthUser])

  useEffect(() => {
    return onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        let user = await getUser(fbUser.uid)
        if (!user) {
          const deviceToken = ensureDeviceToken()
          user = (await createUser({ deviceToken })) as User
        }
        setAuthUser(user)
        // Persist to local storage, to reduce login blink next time.
        // Note: Cap on localStorage size is ~5mb
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user))
        setCachedReferralInfoForUser(user)
        setAuthCookies(await fbUser.getIdToken(), fbUser.refreshToken)
      } else {
        // User logged out; reset to null
        setAuthUser(null)
        localStorage.removeItem(CACHED_USER_KEY)
        deleteAuthCookies()
      }
    })
  }, [setAuthUser])

  const authUserId = authUser?.id
  const authUsername = authUser?.username
  useEffect(() => {
    if (authUserId && authUsername) {
      identifyUser(authUserId)
      setUserProperty('username', authUsername)
      return listenForUser(authUserId, setAuthUser)
    }
  }, [authUserId, authUsername, setAuthUser])

  return (
    <AuthContext.Provider value={authUser}>{children}</AuthContext.Provider>
  )
}
