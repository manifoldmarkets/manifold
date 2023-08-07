import * as functions from 'firebase-functions'
import { invokeFunction, log } from 'shared/utils'
import { onRequest } from 'firebase-functions/v2/https'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { secrets } from 'common/secrets'
import { chunk } from 'lodash'
import { ALL_FEED_USER_ID, DEFAULT_FEED_USER_ID } from 'common/feed'

export const cleanOldFeedRowsScheduler = functions.pubsub
  // 1am every day PST
  .schedule('0 1 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('cleanoldfeedrows'))
    } catch (e) {
      console.error(e)
    }
  })

export const cleanOldNotificationsScheduler = functions.pubsub
  // 2am every day PST
  .schedule('0 2 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('cleanoldnotifications'))
    } catch (e) {
      console.error(e)
    }
  })

export const cleanoldfeedrows = onRequest(
  { timeoutSeconds: 3600, memory: '256MiB', secrets },
  async (_req, res) => {
    console.log('Running clean old feed rows...')
    const pg = createSupabaseDirectClient()
    const userIds = await pg.map(
      'select distinct id from users',
      [],
      (r) => r.id as string
    )
    const chunks = chunk(userIds, 500)

    for (const batch of chunks) {
      await pg.none(
        `
          delete from user_feed
          where id in (
            select id from (
               select
                   id,
                   user_id,
                   row_number() over (
                       partition by user_id
                       order by created_time desc
                       ) as rn
               from
                   user_feed
               where
                   user_id in ($1:list)
           ) as user_feed_rows
            where case
              when user_id in ($2:list) and rn > 5000 then true
              when user_id not in ($2:list) and rn > 600 then true
              else false
              end
          )`,
        [batch, [DEFAULT_FEED_USER_ID, ALL_FEED_USER_ID]]
      )
      log(`Deleted rows from ${batch.length} users`)
    }
    res.status(200).json({ success: true })
  }
)

export const cleanoldnotifications = onRequest(
  { timeoutSeconds: 3600, memory: '256MiB', secrets },
  async (_req, res) => {
    console.log('Running clean old notification rows...')
    const pg = createSupabaseDirectClient()
    const userIds = await pg.map(
      `select distinct id from users`,
      [],
      (r) => r.id as string
    )
    const chunks = chunk(userIds, 500)

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
              rn > 1000
          )`
      await pg.none(query, [batch])
      log(`Deleted notifications from ${batch.length} users`)
    }

    res.status(200).json({ success: true })
  }
)
