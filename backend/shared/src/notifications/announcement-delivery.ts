import { Notification } from 'common/notification'
import { TopLevelPost } from 'common/top-level-post'
import { richTextToString } from 'common/util/parse'
import { nanoid } from 'common/util/random'
import { log } from 'shared/monitoring/log'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'

// Sends an announcement post to every user, 1,000 users per transaction, in
// user id order. Progress lives in announcement_deliveries (see
// migrations/2026112201_announcement_deliveries.sql): a batch's notifications
// and the cursor commit together, so a send that stops for any reason resumes
// where it stopped, and no user is sent the announcement twice.

export const ANNOUNCEMENT_BATCH_SIZE = 1000
// A failing batch is retried this many times before the send gives up for
// now. The resume job takes it up again later.
const ATTEMPTS_PER_BATCH = 3
const RETRY_DELAY_MS = 2000
// A send not finished and not touched for this long has stopped: its sender
// died or gave up. Every batch takes well under a second.
export const STALLED_AFTER_MINUTES = 2

type NotificationTemplate = Omit<Notification, 'id' | 'userId'>

export type AnnouncementDeliveryResult = {
  postId: string
  // Users sent the announcement by this call.
  sent: number
  // Users sent it so far, by every call.
  totalSent: number
  finished: boolean
  error?: string
}

// Records that the post is to be sent to every user. Call it in the
// transaction that creates the post, so an announcement never exists without
// it. Calling it again for the same post does nothing.
export async function queueAnnouncementDelivery(
  pg: SupabaseDirectClient | SupabaseTransaction,
  postId: string
) {
  await pg.none(
    `insert into announcement_deliveries (post_id) values ($1)
     on conflict (post_id) do nothing`,
    [postId]
  )
}

// Sends the queued announcement to every user not yet sent it, and returns
// once no one is left or a batch has failed ATTEMPTS_PER_BATCH times. Safe to
// call while another sender is running: they take turns on the delivery row,
// and each batch starts after the last committed one.
export async function deliverAnnouncement(
  pg: SupabaseDirectClient,
  postId: string,
  options: { batchSize?: number; retryDelayMs?: number } = {}
): Promise<AnnouncementDeliveryResult> {
  const batchSize = options.batchSize ?? ANNOUNCEMENT_BATCH_SIZE
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS

  const post = await pg.oneOrNone<{ data: TopLevelPost }>(
    `select data from old_posts where id = $1`,
    [postId]
  )
  const delivery = await pg.oneOrNone<{ sent_count: number }>(
    `select sent_count from announcement_deliveries where post_id = $1`,
    [postId]
  )
  if (!delivery) {
    return {
      postId,
      sent: 0,
      totalSent: 0,
      finished: false,
      error: 'not queued',
    }
  }
  if (!post?.data.isAnnouncement) {
    // Nothing to send. Close the row so the resume job stops looking at it.
    const error = post ? 'post is not an announcement' : 'post not found'
    await pg.none(
      `update announcement_deliveries
       set finished_time = now(), updated_time = now(), last_error = $2
       where post_id = $1 and finished_time is null`,
      [postId, error]
    )
    log.warn(`Announcement ${postId} not sent: ${error}`)
    return {
      postId,
      sent: 0,
      totalSent: delivery.sent_count,
      finished: true,
      error,
    }
  }

  const template = notificationTemplate(post.data)
  let sent = 0
  let totalSent = delivery.sent_count
  let failures = 0
  log(`Sending announcement ${postId} to every user`, {
    postId,
    alreadySent: totalSent,
  })

  while (true) {
    let batch: BatchResult
    try {
      batch = await pg.tx((tx) =>
        sendNextBatch(tx, postId, template, batchSize)
      )
    } catch (e) {
      failures++
      const error = e instanceof Error ? e.message : String(e)
      // Never the pg error object itself: it carries the query, and an
      // oversized log entry is dropped without a trace.
      await pg
        .none(
          `update announcement_deliveries
           set last_error = $2, updated_time = now()
           where post_id = $1`,
          [postId, error.slice(0, 1000)]
        )
        .catch(() => undefined)
      if (failures < ATTEMPTS_PER_BATCH) {
        log.warn(`Announcement ${postId} batch failed, retrying`, {
          postId,
          error,
          attempt: failures,
        })
        await sleep(retryDelayMs * failures)
        continue
      }
      log.error(
        `Announcement ${postId} stopped after ${totalSent} users; the resume job will retry`,
        { postId, error, totalSent }
      )
      return { postId, sent, totalSent, finished: false, error }
    }

    failures = 0
    sent += batch.sent
    totalSent = batch.totalSent
    if (batch.finished) {
      log(`Announcement ${postId} sent to ${totalSent} users`, {
        postId,
        totalSent,
        sentNow: sent,
      })
      return { postId, sent, totalSent, finished: true }
    }
  }
}

// Resumes every send that has stopped. Run by the scheduler.
export async function resumeStalledAnnouncementDeliveries(
  pg: SupabaseDirectClient,
  options: { batchSize?: number; retryDelayMs?: number } = {}
) {
  const postIds = await pg.map(
    `select post_id from announcement_deliveries
     where finished_time is null
       and updated_time < now() - make_interval(mins => $1)
     order by created_time`,
    [STALLED_AFTER_MINUTES],
    (r: { post_id: string }) => r.post_id
  )
  const results: AnnouncementDeliveryResult[] = []
  for (const postId of postIds) {
    log(`Resuming announcement ${postId}`)
    results.push(await deliverAnnouncement(pg, postId, options))
  }
  return results
}

type BatchResult = { sent: number; totalSent: number; finished: boolean }

async function sendNextBatch(
  tx: SupabaseTransaction,
  postId: string,
  template: Omit<NotificationTemplate, 'createdTime'>,
  batchSize: number
): Promise<BatchResult> {
  // The row lock makes concurrent senders take turns: the second one waits
  // here, then reads the cursor the first one committed.
  const delivery = await tx.oneOrNone<{
    last_user_id: string | null
    sent_count: number
    finished: boolean
    created_ms: number
  }>(
    `select last_user_id, sent_count, finished_time is not null as finished,
       (extract(epoch from created_time) * 1000)::bigint as created_ms
     from announcement_deliveries
     where post_id = $1
     for update`,
    [postId]
  )
  if (!delivery) throw new Error(`Announcement ${postId} is not queued`)
  if (delivery.finished) {
    return { sent: 0, totalSent: delivery.sent_count, finished: true }
  }

  const userIds = await tx.map(
    `select id from users
     where $1::text is null or id > $1
     order by id
     limit $2`,
    [delivery.last_user_id, batchSize],
    (r: { id: string }) => r.id
  )

  if (userIds.length > 0) {
    const data: NotificationTemplate = {
      ...template,
      createdTime: Number(delivery.created_ms),
    }
    // A fresh random id per user, as every other notification has: some
    // queries still join user_notifications on notification_id, and one
    // shared id would match every user's row (see #4143). The ids and user
    // ids go as two array parameters, so the statement stays small however
    // large the batch.
    await tx.none(
      `insert into user_notifications (user_id, notification_id, data)
       select n.user_id, n.notification_id,
         $3::jsonb || jsonb_build_object('id', n.notification_id, 'userId', n.user_id)
       from unnest($1::text[], $2::text[]) as n(user_id, notification_id)`,
      [userIds, userIds.map(() => nanoid(6)), JSON.stringify(data)]
    )
  }

  const finished = userIds.length < batchSize
  const totalSent = delivery.sent_count + userIds.length
  await tx.none(
    `update announcement_deliveries
     set last_user_id = coalesce($2, last_user_id),
       sent_count = $3,
       finished_time = case when $4 then now() else null end,
       updated_time = now(),
       last_error = null
     where post_id = $1`,
    [postId, userIds[userIds.length - 1] ?? null, totalSent, finished]
  )
  return { sent: userIds.length, totalSent, finished }
}

function notificationTemplate(
  post: TopLevelPost
): Omit<NotificationTemplate, 'createdTime'> {
  return {
    reason: 'admin',
    isSeen: false,
    sourceId: post.id,
    sourceType: 'post',
    sourceUpdateType: 'created',
    sourceUserName: post.creatorName,
    sourceUserUsername: post.creatorUsername,
    sourceUserAvatarUrl: post.creatorAvatarUrl ?? '',
    sourceText: richTextToString(post.content).slice(0, 200),
    sourceSlug: `post/${post.slug}`,
    sourceTitle: post.title,
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
