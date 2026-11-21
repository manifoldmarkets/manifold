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
//   npx ts-node send-announcement.ts --post=<postId> [--apply] [--reopen]
//     [--no-skip-check]
//
// Run it only when no old-style send of the post is still going.
// A send this script queues checks each user for a notification for the post
// before sending them one, so users the old sender reached are skipped. The
// delivery row keeps that setting, so a send the scheduler resumes keeps
// skipping them too. (A heavy user whose copy was pruned by
// clean-old-notifications gets it again: they no longer have one.)
//
// The check reads only each batch's notifications from the post's time on
// (about 0.7 s a batch on prod). For a post nobody has yet, --no-skip-check
// on the --apply run sends without it; it is refused if the sample finds
// anyone who has the post.
//
// A send closed early because the post was unlisted stays closed; --reopen
// carries it on once the post is listed again. Exits nonzero unless everyone
// has been sent it.

const SAMPLE_SIZE = 300

if (require.main === module) {
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    const reopen = process.argv.includes('--reopen')
    const noSkipCheck = process.argv.includes('--no-skip-check')
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
          : 'none yet'
      }`
    )
    console.log(
      `Sample:    ${sample.already} of ${SAMPLE_SIZE} random users already have it`
    )
    console.log(
      `Check:     ${
        noSkipCheck
          ? 'off (--no-skip-check): sends without checking who has it'
          : 'on: skips users who have it (reads their notifications)'
      }`
    )
    if (noSkipCheck && sample.already > 0)
      throw new Error(
        'Some users already have this post, so --no-skip-check would send them a second one. Run without it.'
      )

    // A finished row with an error was closed early: the post was unlisted
    // or not an announcement when a batch read it.
    const closed = delivery?.finished_time ? delivery.last_error : null
    if (delivery?.finished_time && !closed) {
      console.log('Already sent to everyone. Nothing to do.')
      return
    }
    if (closed && !reopen) {
      throw new Error(
        `This send was closed early (${closed}). If the post is listed again and should go out, pass --reopen.`
      )
    }
    if (!apply) {
      console.log(`Dry run. Pass --apply${closed ? ' --reopen' : ''} to send.`)
      return
    }

    if (closed) {
      // Carries on from where it was closed, skipping users who have it.
      await pg.none(
        `update announcement_deliveries
         set finished_time = null, last_error = null, skip_existing = true,
           updated_time = now()
         where post_id = $1 and finished_time is not null
           and last_error is not null`,
        [postId]
      )
    }
    await queueAnnouncementDelivery(pg, postId, {
      skipUsersWhoHaveIt: !noSkipCheck,
    })
    // An unfinished send queued by an earlier run takes this run's setting.
    await pg.none(
      `update announcement_deliveries set skip_existing = $2
       where post_id = $1 and finished_time is null`,
      [postId, !noSkipCheck]
    )
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
