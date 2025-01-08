import { useEffect } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { User } from 'common/user'
import { useState } from 'react'
import { FullUser } from 'common/api/user-types'

export const useWebsocketUser = (
  userId: string | undefined,
  isPageVisible: boolean,
  getFullUserById: (id: string) => Promise<FullUser>
) => {
  const [user, setUser] = useState<User | null | undefined>()

  useApiSubscription({
    topics: [`user/${userId ?? '_'}`],
    onBroadcast: ({ data }) => {
      const { user } = data
      console.log('ws update', user)
      setUser((prevUser) => {
        if (!prevUser) {
          return prevUser
        } else {
          return {
            ...prevUser,
            ...(user as Partial<User>),
          }
        }
      })
    },
  })

  const refreshUser = async (id: string) => {
    const result = await getFullUserById(id)
    setUser(result)
  }

  useEffect(() => {
    if (!isPageVisible) return

    if (userId) {
      refreshUser(userId)
    } else {
      setUser(null)
    }
  }, [userId, isPageVisible])

  return user
}
