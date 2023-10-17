import { keyBy } from 'lodash'
import { useEffect } from 'react'
import { Row } from 'common/supabase/utils'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { db } from 'web/lib/supabase/db'
import { getUsers } from 'web/lib/supabase/user'
import { User } from 'common/user'

export const useLovers = () => {
  const [lovers, setLovers] = usePersistentInMemoryState<
    (Row<'lovers'> & { user: User })[] | undefined
  >(undefined, 'lovers')

  useEffect(() => {
    db.from('lovers')
      .select('*')
      .then(({ data }) => {
        if (data) {
          getUsers(data.map((d) => d.user_id)).then((users) => {
            const usersById = keyBy(users, 'id')
            const dataWithUser = data.map((d) => {
              const user = usersById[d.user_id]
              return { ...d, user }
            })
            setLovers(dataWithUser)
          })
        }
      })
  }, [])

  return lovers
}
