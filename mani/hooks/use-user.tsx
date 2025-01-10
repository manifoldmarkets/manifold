import { createContext, useContext, useEffect, useState } from 'react'
import { User as FirebaseUser, onIdTokenChanged } from 'firebase/auth'
import { auth } from 'lib/firebase/init'
import {
  type PrivateUser,
  type User,
  type UserAndPrivateUser,
} from 'common/user'
import { api } from 'lib/api'
import { APIError } from 'common/api/utils'
import { getData } from 'lib/auth-storage'
import {
  useWebsocketUser as useWebsocketUserCommon,
  useWebsocketPrivateUser as useWebsocketPrivateUserCommon,
} from 'client-common/hooks/use-websocket-user'
import { useIsPageVisible } from './use-is-page-visibile'
import Toast from 'react-native-toast-message'
// Either we haven't looked up the logged in user yet (undefined), or we know
// the user is not logged in (null), or we know the user is logged in.
export type AuthUser = undefined | null | UserAndPrivateUser

const UserContext = createContext<AuthUser | undefined>(undefined)
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | undefined | null>(undefined)
  const [privateUser, setPrivateUser] = useState<PrivateUser | undefined>(
    undefined
  )
  const listenUser = useWebsocketUser(user?.id)
  const listenPrivateUser = useWebsocketPrivateUser(user?.id)

  useEffect(() => {
    if (listenUser) {
      if (user) {
        const balanceChange = listenUser.balance - user.balance
        const cashBalanceChange = listenUser.cashBalance - user.cashBalance

        if (balanceChange > 0 || cashBalanceChange > 0) {
          Toast.show({
            type: 'success',
            text1: '🎉  Cha-ching!',
            // TODO: format with coins
            text2: `${balanceChange > 0 ? `+${balanceChange}` : ''} ${
              cashBalanceChange > 0 ? `+${cashBalanceChange}` : ''
            }`,
          })
        }
      }
      setUser(listenUser)
    }
  }, [JSON.stringify(listenUser)])

  useEffect(() => {
    if (listenPrivateUser) {
      setPrivateUser(listenPrivateUser)
    }
  }, [listenPrivateUser])

  const onAuthLoad = (
    fbUser: FirebaseUser,
    user: User,
    privateUser: PrivateUser
  ) => {
    setUser(user)
    setPrivateUser(privateUser)
    // generate auth token
    fbUser.getIdToken()
  }

  const getAdminToken = async () => {
    const key = 'admin-token'
    const localStorageToken = await getData<string>(key)
    return localStorageToken ?? ''
  }

  useEffect(() => {
    return onIdTokenChanged(
      auth,
      async (fbUser) => {
        console.log('onIdTokenChanged', fbUser?.email)
        if (fbUser) {
          const [user, privateUser] = await Promise.all([
            getUserSafe(fbUser.uid),
            getPrivateUserSafe(),
            // getSupabaseToken().catch((e) => {
            //   console.error('Error getting supabase token', e)
            //   return null
            // }),
          ])
          // if (supabaseJwt) updateSupabaseAuth(supabaseJwt.jwt)

          if (!user || !privateUser) {
            // const deviceToken = ensureDeviceToken()
            const adminToken = await getAdminToken()
            const newUser = (await api('createuser', {
              // deviceToken,
              adminToken,
              // visitedContractIds: getSavedContractVisitsLocally(),
              origin: 'mani',
            })) as UserAndPrivateUser

            onAuthLoad(fbUser, newUser.user, newUser.privateUser)
          } else {
            onAuthLoad(fbUser, user, privateUser)
          }
        } else {
          // User logged out; reset to null
          setUser(null)
          setPrivateUser(undefined)
          // TODO: Clear local storage only if we were signed in
        }
      },
      (e) => {
        console.error(e)
      }
    )
  }, [])
  const value = !user
    ? user
    : !privateUser
    ? privateUser
    : {
        user,
        privateUser,
      }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const context = useContext(UserContext)
  return context ? context.user : context
}

export function usePrivateUser() {
  const context = useContext(UserContext)
  return context ? context.privateUser : context
}

async function getUserSafe(userId: string) {
  try {
    return await api('user/by-id/:id', { id: userId })
  } catch (e) {
    if (e instanceof APIError && e.code === 404) {
      return null
    }
    throw e
  }
}

async function getPrivateUserSafe() {
  try {
    return await api('me/private')
  } catch (e) {
    return null
  }
}

export const useWebsocketUser = (userId: string | undefined) => {
  const isPageVisible = useIsPageVisible()
  return useWebsocketUserCommon(userId, isPageVisible, () =>
    api('user/by-id/:id', { id: userId ?? '_' })
  )
}

export const useWebsocketPrivateUser = (userId: string | undefined) => {
  const isPageVisible = useIsPageVisible()
  return useWebsocketPrivateUserCommon(
    userId,
    isPageVisible,
    getPrivateUserSafe
  )
}
