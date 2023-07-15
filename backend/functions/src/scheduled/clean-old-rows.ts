import * as functions from 'firebase-functions'
import { invokeFunction } from 'shared/utils'
import { onRequest } from 'firebase-functions/v2/https'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { secrets } from 'common/secrets'

export const cleanOldFeedRowsScheduler = functions.pubsub
  // 2am on Sunday PST
  .schedule('0 2 * * 0')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('cleanoldfeedrows'))
    } catch (e) {
      console.error(e)
    }
  })

export const cleanoldfeedrows = onRequest(
  { timeoutSeconds: 3600, memory: '256MiB', secrets },
  async (_req, res) => {
    console.log('Running clean old feed rows...')
    const pg = createSupabaseDirectClient()
    await pg.none(
      `
        delete from user_feed where id in (
          select id from (
             select
                 id,
                 row_number() over (
                     partition by user_id
                     order by created_time desc
                     ) as rn
             from
                 user_feed
         ) as user_feed_rows
          where
              rn > 600
          );`
    )
    res.status(200).json({ success: true })
  }
)
export const cleanOldNotificationsScheduler = functions.pubsub
  // 4am on Sunday PST
  .schedule('0 4 * * 0')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('cleanoldnotifications'))
    } catch (e) {
      console.error(e)
    }
  })

export const cleanoldnotifications = onRequest(
  { timeoutSeconds: 3600, memory: '256MiB', secrets },
  async (_req, res) => {
    console.log('Running clean old notification rows...')
    const pg = createSupabaseDirectClient()
    await pg.none(
      `
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
         ) as user_notif_rows
          where
              rn > 1000
          );`
    )
    res.status(200).json({ success: true })
  }
)
