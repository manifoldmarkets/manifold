import { useUser } from 'web/hooks/use-user'
import { useEffect } from 'react'
import { Row } from 'common/supabase/utils'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { User } from 'common/user'
import { getLoverRow, Lover } from 'common/love/lover'
import { db } from 'web/lib/supabase/db'

export const useLover = () => {
  const user = useUser()
  const [lover, setLover] = usePersistentInMemoryState<
    Row<'lovers'> | undefined | null
  >(undefined, `lover-${user?.id}`)

  useEffect(() => {
    if (user)
      getLoverRow(user.id, db).then((lover) => {
        if (!lover) setLover(null)
        else setLover(lover)
      })
  }, [user?.id])

  return user && lover ? { ...lover, user } : lover === null ? null : undefined
}

export const useLoverByUser = (user: User | undefined) => {
  const userId = user?.id
  const [lover, setLover] = usePersistentInMemoryState<
    Lover | undefined | null
  >(undefined, `lover-${userId}`)

  useEffect(() => {
    if (userId)
      getLoverRow(userId, db).then((lover) => {
        if (!lover) setLover(null)
        else setLover({ ...lover, user })
      })
  }, [userId])

  return lover
}
