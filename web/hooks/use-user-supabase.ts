import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { getUser } from 'web/lib/supabase/user'

export function useUserById(userId: string) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => {
    if (userId) {
      getUser(userId).then((result) => {
        setUser(result)
      })
    }
  }, [userId])
  return user
}
