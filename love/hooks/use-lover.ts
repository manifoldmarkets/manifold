import { useUser } from 'web/hooks/use-user'
import { useEffect } from 'react'
import { Row } from 'common/supabase/utils'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { User } from 'common/user'
import { getLover } from 'love/lib/supabase/lovers'
export type Lover = Row<'lovers'> & { user: User }
export const useLover = () => {
  const user = useUser()
  const [lover, setLover] = usePersistentInMemoryState<
    Row<'lovers'> | undefined | null
  >(undefined, `lover-${user?.id}`)

  useEffect(() => {
    if (user)
      getLover(user.id).then((lover) => {
        if (!lover) setLover(null)
        else setLover(lover)
      })
  }, [user?.id])

  return user && lover ? { ...lover, user } : lover === null ? null : undefined
}
