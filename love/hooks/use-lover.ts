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
    Row<'lovers'> | undefined
  >(undefined, `lover-${user?.id}`)

  useEffect(() => {
    if (user) getLover(user.id).then(setLover)
  }, [user?.id])

  return user && lover ? { ...lover, user } : undefined
}
