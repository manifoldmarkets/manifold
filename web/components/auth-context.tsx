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

const CACHED_USER_KEY = 'CACHED_USER_KEY'

const ensureDeviceToken = () => {
  let deviceToken = localStorage.getItem('device-token')
  if (!deviceToken) {
    deviceToken = randomString()
    localStorage.setItem('device-token', deviceToken)
  }
  return deviceToken
}

export const AuthContext = createContext<User | null>(null)

export function AuthProvider({ children }: any) {
  const [currentUser, setCurrentUser] = useStateCheckEquality<User | null>(null)

  useEffect(() => {
    const cachedUser = localStorage.getItem(CACHED_USER_KEY)
    setCurrentUser(cachedUser && JSON.parse(cachedUser))
  }, [setCurrentUser])

  useEffect(() => {
    return onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        let user = await getUser(fbUser.uid)
        if (!user) {
          const deviceToken = ensureDeviceToken()
          user = (await createUser({ deviceToken })) as User
        }
        setCurrentUser(user)
        // Persist to local storage, to reduce login blink next time.
        // Note: Cap on localStorage size is ~5mb
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user))
        setCachedReferralInfoForUser(user)
        setAuthCookies(await fbUser.getIdToken(), fbUser.refreshToken)
      } else {
        // User logged out; reset to null
        setCurrentUser(null)
        localStorage.removeItem(CACHED_USER_KEY)
        deleteAuthCookies()
      }
    })
  }, [setCurrentUser])

  useEffect(() => {
    if (currentUser) {
      identifyUser(currentUser.id)
      setUserProperty('username', currentUser.username)
      return listenForUser(currentUser.id, setCurrentUser)
    }
  }, [currentUser, setCurrentUser])

  return (
    <AuthContext.Provider value={currentUser}>{children}</AuthContext.Provider>
  )
}
