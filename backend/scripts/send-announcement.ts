import { runScript } from 'run-script'
import { TopLevelPost } from 'common/top-level-post'
import {
  deliverAnnouncement,
  queueAnnouncementDelivery,
} from 'shared/notifications/announcement-delivery'

// Sends an announcement post to every user who doesn't have it, the same way
// create-post does (shared/notifications/announcement-delivery.ts): 1,000
// users per transaction, resumable, nobody twice. For an announcement the
// old sender reached part of, or none of, or to finish one by hand. Prints
// the plan; pass --apply to send.
//
//   npx ts-node send-announcement.ts --post=<postId> [--apply]
//
// A send this script queues checks each user for a notification for the post
// before sending them one, so users the old sender reached are skipped. The
// delivery row keeps that setting, so a send the scheduler resumes keeps
// skipping them too. Exits nonzero unless everyone has been sent it.

const SAMPLE_SIZE = 300

if (require.main === module) {
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
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
    if (post.data.visibility === 'unlisted')
      throw new Error(`Post ${postId} is unlisted`)

    const delivery = await pg.oneOrNone<{
      sent_count: number
      finished_time: string | null
      last_error: string | null
      skip_existing: boolean
    }>(
      `select sent_count, finished_time, last_error, skip_existing
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
            }${delivery.skip_existing ? ', skipping users who have it' : ''}`
          : 'none yet (this run skips users who have it)'
      }`
    )
    console.log(
      `Sample:    ${sample.already} of ${SAMPLE_SIZE} random users already have it`
    )

    if (delivery?.finished_time) {
      console.log('Already finished. Nothing to do.')
      return
    }
    if (!apply) {
      console.log('Dry run. Pass --apply to send.')
      return
    }

    await queueAnnouncementDelivery(pg, postId, { skipUsersWhoHaveIt: true })
    const result = await deliverAnnouncement(pg, postId)
    if (!result.finished || result.closed)
      throw new Error(
        `Stopped after ${result.totalSent} users: ${
          result.error ?? result.closed
        }. Run it again to resume.`
      )
    console.log(
      `Done: sent to ${result.sent} users now, ${result.totalSent} in all.`
    )
  })
}
