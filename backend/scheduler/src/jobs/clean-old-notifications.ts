import { chunk } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

const MAX_NOTIFICATIONS_PER_USER = 1000
const USERS_PER_DELETE = 500

export async function cleanOldNotifications() {
  log('Running clean old notifications...')
  const pg = createSupabaseDirectClient()

  // Only users over the cap have anything to delete, and that is a small
  // minority (9,123 of ~243k users on 2026-10-09, holding 360k excess rows).
  // This job used to walk every user in 486 chunks and run the windowed
  // delete below for each, which took 4-8 hours a night and had not finished
  // a run since 2026-10-04 because the scheduler was restarting under it.
  // One pass over the (user_id, notification_id) primary key finds the users
  // that matter in a couple of minutes; the delete then runs over ~19 chunks.
  const userIds = await pg.map(
    `select user_id
     from user_notifications
     group by user_id
     having count(*) > $1`,
    [MAX_NOTIFICATIONS_PER_USER],
    (r) => r.user_id as string
  )
  log(
    `${userIds.length} user(s) have more than ${MAX_NOTIFICATIONS_PER_USER} notifications`
  )
  const chunks = chunk(userIds, USERS_PER_DELETE)

  for (const batch of chunks) {
    const query = `
      delete from user_notifications
      where (user_id, notification_id) in (
          select user_id, notification_id from (
             select
                 user_id,
                 notification_id,
                 row_number() over (
                     partition by user_id
                     order by ((data->'createdTime')::bigint) desc
                     ) as rn
             from
                 user_notifications
             where
                 user_id in ($1:list)
         ) as user_notif_rows
          where
              rn > $2
          )`
    await pg.none(query, [batch, MAX_NOTIFICATIONS_PER_USER])
    log(`Deleted notifications from ${batch.length} users`)
  }
  log(`Finished cleaning old notifications for ${userIds.length} user(s)`)
}
