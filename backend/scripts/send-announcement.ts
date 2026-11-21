import { runScript } from 'run-script'
import { TopLevelPost } from 'common/top-level-post'
import {
  deliverAnnouncement,
  queueAnnouncementDelivery,
} from 'shared/notifications/announcement-delivery'

// Sends an announcement post to every user who hasn't been sent it, the same
// way create-post does (shared/notifications/announcement-delivery.ts):
// 1,000 users per transaction, resumable, nobody twice. Use it for an
// announcement posted before that existed, or to finish one by hand. Prints
// the plan; pass --apply to send.
//
//   npx ts-node send-announcement.ts --post=<postId> [--apply]
//
// A post sent the old way, partly, already has notifications for some users
// (in user id order). This send knows nothing of those, so they would get a
// second one: the plan samples users to check, and refuses such a post
// unless you pass --allow-duplicates.

const SAMPLE_SIZE = 300

if (require.main === module) {
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    const allowDuplicates = process.argv.includes('--allow-duplicates')
    const postId = process.argv
      .find((arg) => arg.startsWith('--post='))
      ?.slice('--post='.length)
    if (!postId) throw new Error('Pass --post=<postId>')

    const post = await pg.oneOrNone<{ data: TopLevelPost }>(
      `select data from old_posts where id = $1`,
      [postId]
    )
    if (!post) throw new Error(`No post ${postId}`)
    if (!post.data.isAnnouncement)
      throw new Error(`Post ${postId} is not an announcement`)

    const delivery = await pg.oneOrNone<{
      sent_count: number
      last_user_id: string | null
      finished_time: string | null
      last_error: string | null
    }>(
      `select sent_count, last_user_id, finished_time, last_error
       from announcement_deliveries where post_id = $1`,
      [postId]
    )
    const users = await pg.one<{ count: number }>(
      `select count(*)::int as count from users`
    )
    // Users holding a notification for this post from an earlier send.
    const sample = await pg.one<{ already: number }>(
      `select count(*) filter (where exists (
           select 1 from user_notifications n
           where n.user_id = u.id and n.data->>'sourceId' = $1
         ))::int as already
       from (select id from users order by random() limit $2) u`,
      [postId, SAMPLE_SIZE]
    )

    console.log(`Post:      ${post.data.title} (/post/${post.data.slug})`)
    console.log(`Users:     ${users.count}`)
    console.log(
      `Delivery:  ${
        delivery
          ? `${delivery.sent_count} sent, ${
              delivery.finished_time
                ? `finished ${delivery.finished_time}`
                : 'not finished'
            }${
              delivery.last_error ? `, last error: ${delivery.last_error}` : ''
            }`
          : 'none yet'
      }`
    )
    console.log(
      `Sample:    ${sample.already} of ${SAMPLE_SIZE} random users already have it`
    )

    if (delivery?.finished_time) {
      console.log('Already sent to everyone. Nothing to do.')
      return
    }
    if (!delivery && sample.already > 0 && !allowDuplicates) {
      throw new Error(
        'Some users already have this announcement from an earlier send and would get it twice. Pass --allow-duplicates to send anyway.'
      )
    }
    if (!apply) {
      console.log('Dry run. Pass --apply to send.')
      return
    }

    await queueAnnouncementDelivery(pg, postId)
    const result = await deliverAnnouncement(pg, postId)
    console.log(
      result.finished
        ? `Done: sent to ${result.sent} users now, ${result.totalSent} in all.`
        : `Stopped after ${result.totalSent} users: ${result.error}. Run it again to resume.`
    )
  })
}
