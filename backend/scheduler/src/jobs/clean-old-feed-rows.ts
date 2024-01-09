import { createSupabaseDirectClient } from 'shared/supabase/init'
import { JobContext } from 'shared/utils'

export async function cleanOldFeedRows({ log }: JobContext) {
  log('Running clean old feed rows...')
  const pg = createSupabaseDirectClient()
  const BATCH_SIZE = 1000000
  while (true) {
    const result = await pg.one(
      `with deleted as (
      delete from user_feed where id in
        (select id from user_feed where created_time < now() - interval '2 weeks' limit $1)
      returning 1
     )
     select count(*) as n from deleted`,
      [BATCH_SIZE]
    )
    log(`Deleted ${result.n} old feed rows.`)
    if (result.n < BATCH_SIZE) {
      return
    }
  }
}
