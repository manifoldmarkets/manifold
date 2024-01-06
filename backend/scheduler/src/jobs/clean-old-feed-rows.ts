import { chunk } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { JobContext } from 'shared/utils'

export async function cleanOldFeedRows({ log }: JobContext) {
  log('Running clean old feed rows...')
  const pg = createSupabaseDirectClient()
  const userIds = await pg.map(
    'select distinct id from users',
    [],
    (r) => r.id as string
  )
  const chunks = chunk(userIds, 500)
  for (const batch of chunks) {
    await pg.none(
      `delete from user_feed
         where user_id in ($1:list) and created_time < now() - interval '2 weeks'`,
      [batch]
    )
    log(`Deleted rows from ${batch.length} users`)
  }
}
