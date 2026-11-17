import {
  getNewsletterNotification,
  NEWSLETTER_NOTIFICATION_ID,
} from 'common/newsletter'
import { chunk } from 'lodash'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Pins the newsletter invitation in the notifications of everyone who signed up
// on or after --since (default 2025-01-23). New signups get it from
// onCreateUser. Dry run unless --apply. Users who already have it are skipped,
// so it is safe to re-run.
//
//   npx ts-node send-newsletter-notification.ts [--since=2025-01-23] [--apply]
if (require.main === module)
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    const since =
      process.argv.find((arg) => arg.startsWith('--since='))?.slice(8) ??
      '2025-01-23'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since))
      throw new Error('--since must be YYYY-MM-DD')

    // Same exclusions as userOptedOutOfBrowserNotifications, done in SQL so we
    // only fetch ids.
    const userIds = await pg.map(
      `select u.id from users u
       join private_users p on p.id = u.id
       where u.created_time >= $1
         and not coalesce((u.data->>'userDeleted')::boolean, false)
         and not coalesce((u.data->>'isBannedFromPosting')::boolean, false)
         and not coalesce(u.is_bot, false)
         and not exists (
           select 1 from user_bans b
           where b.user_id = u.id
             and b.ended_at is null
             and (b.end_time is null or b.end_time > now())
             and b.ban_type <> 'modAlert'
         )
         and not (
           coalesce(p.data->'notificationPreferences'->'opt_out_all', '[]'::jsonb)
             ? 'browser'
         )
         and not exists (
           select 1 from user_notifications n
           where n.user_id = u.id and n.notification_id = $2
         )`,
      [since, NEWSLETTER_NOTIFICATION_ID],
      (row: { id: string }) => row.id
    )
    log(
      `Signed up since ${since}, not opted out, not yet notified: ${userIds.length}`
    )
    if (!apply) {
      log('Dry run. Re-run with --apply to insert.')
      return
    }

    const now = Date.now()
    let inserted = 0
    for (const batch of chunk(userIds, 5000)) {
      const rows = batch.map((userId) => {
        const notification = getNewsletterNotification(userId, now)
        return {
          user_id: userId,
          notification_id: notification.id,
          data: notification,
        }
      })
      const result = await pg.result(
        `insert into user_notifications (user_id, notification_id, data)
         select x.user_id, x.notification_id, x.data
         from jsonb_to_recordset($1::jsonb)
           as x(user_id text, notification_id text, data jsonb)
         on conflict do nothing`,
        [JSON.stringify(rows)]
      )
      inserted += result.rowCount
      log(`Inserted ${inserted} of ${userIds.length}`)
    }
    log(`Done: ${inserted} newsletter notifications inserted.`)
  })
