import { User } from 'common/user'
import { useEffect } from 'react'
import { getUser } from 'web/lib/supabase/user'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export function useUserById(userId: string | undefined) {
  const [user, setUser] = usePersistentInMemoryState<User | null | undefined>(
    undefined,
    `user-${userId}`
  )
  useEffect(() => {
    if (userId) {
      getUser(userId).then((result) => {
        setUser(result)
      })
    }
  }, [userId])
  return user
}
