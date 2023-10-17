import { useUser } from 'web/hooks/use-user'
import { useEffect } from 'react'
import { Row, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { User } from 'common/user'
export type Lover = Row<'lovers'> & { user: User }
export const useLover = () => {
  const user = useUser()
  const [lover, setLover] = usePersistentInMemoryState<
    Row<'lovers'> | undefined
  >(undefined, `lover-${user?.id}`)

  useEffect(() => {
    if (user) {
      run(db.from('lovers').select('*').eq('user_id', user.id)).then(
        ({ data }) => setLover(data[0])
      )
    }
  }, [user?.id])

  return user && lover ? { ...lover, user } : undefined
}
