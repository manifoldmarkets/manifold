import { keyBy, chunk } from 'lodash'
import { useEffect } from 'react'
import { Row } from 'common/supabase/utils'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { db } from 'web/lib/supabase/db'
import { getUsers } from 'web/lib/supabase/user'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import { Lover } from 'common/love/lover'
import { getCompatibleLovers } from 'web/lib/firebase/api'

export const useLovers = () => {
  const [lovers, setLovers] = usePersistentInMemoryState<
    (Row<'lovers'> & { user: User })[] | undefined
  >(undefined, 'lovers')

  useEffect(() => {
    db.from('lovers')
      .select('*')
      .filter('looking_for_matches', 'eq', true)
      .order('created_time', { ascending: false })
      .neq('pinned_url', null)
      .then(async ({ data }) => {
        if (!data) return
        const userChunks = chunk(data, 250)
        const newLovers: Lover[] = []
        await Promise.all(
          userChunks.map(async (chunk) =>
            getUsers(chunk.map((d) => d.user_id)).then((users) => {
              const usersById = keyBy(users, 'id')
              const dataWithUser = data.map((d) => {
                const user = usersById[d.user_id]
                if (!user || user.isBannedFromPosting) return undefined
                return { ...d, user }
              })
              newLovers.push(...filterDefined(dataWithUser))
            })
          )
        )
        setLovers(newLovers)
      })
  }, [])

  return lovers
}

export const useCompatibleLovers = (userId: string) => {
  const [lovers, setLovers] = usePersistentInMemoryState<
    (Row<'lovers'> & { user: User })[] | undefined
  >(undefined, `compatible-lovers-${userId}`)

  useEffect(() => {
    getCompatibleLovers({ userId }).then((result) => {
      console.log('got compatible lovers', result)
      setLovers(result.lovers)
    })
  }, [userId])

  return lovers
}
