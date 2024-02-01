import { useUser } from 'web/hooks/use-user'
import { useEffect } from 'react'
import { Row } from 'common/supabase/utils'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { User } from 'common/user'
import { getLoverRow, Lover, LoverRow } from 'common/love/lover'
import { db } from 'web/lib/supabase/db'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export const useLover = () => {
  const user = useUser()
  const [lover, setLover] = usePersistentLocalState<
    Row<'lovers'> | undefined | null
  >(undefined, `lover-${user?.id}`)

  const refreshLover = () => {
    if (user) {
      getLoverRow(user.id, db).then((lover) => {
        if (!lover) setLover(null)
        else setLover(lover)
      })
    }
  }

  useEffect(() => {
    refreshLover()
  }, [user?.id])

  return user && lover ? { ...lover, user } : lover === null ? null : undefined
}

export const useLoverByUser = (user: User | undefined) => {
  const userId = user?.id
  const [lover, setLover] = usePersistentInMemoryState<
    Lover | undefined | null
  >(undefined, `lover-user-${userId}`)

  function refreshLover() {
    if (userId)
      getLoverRow(userId, db).then((lover) => {
        if (!lover) setLover(null)
        else setLover({ ...lover, user })
      })
  }

  useEffect(() => {
    refreshLover()
  }, [userId])

  return { lover, refreshLover }
}

export const useLoverByUserId = (userId: string | undefined) => {
  const [lover, setLover] = usePersistentInMemoryState<
    LoverRow | undefined | null
  >(undefined, `lover-${userId}`)

  useEffect(() => {
    if (userId)
      getLoverRow(userId, db).then((lover) => {
        if (!lover) setLover(null)
        else setLover(lover)
      })
  }, [userId])

  return lover
}
