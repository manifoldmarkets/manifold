import { chunk, keyBy } from 'lodash'
import { Row, run, selectFrom, SupabaseClient } from './utils'
import { User } from 'common/user'

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

export const convertUser = (row: Row<'users'> | null): User | null => {
  if (!row) return null
  return {
    ...(row.data as User),
    id: row.id,
    username: row.username,
    name: row.name,
  } as User
}
