import { chunk, keyBy } from 'lodash'
import { run, selectFrom, SupabaseClient } from './utils'

export const getUsernameById = async (
  userIds: string[],
  db: SupabaseClient
) => {
  const chunks = chunk(userIds, 150)
  const promises = chunks.map((chunk) =>
    run(selectFrom(db, 'users', 'username', 'id').in('id', chunk))
  )
  const results = await Promise.all(promises)
  return keyBy(
    results.flatMap((result) =>
      result.data.map((r) => {
        return {
          id: r.id,
          username: r.username,
        }
      })
    ),
    'id'
  )
}
