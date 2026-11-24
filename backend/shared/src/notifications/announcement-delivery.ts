import { Notification } from 'common/notification'
import { TopLevelPost } from 'common/top-level-post'
import { richTextToString } from 'common/util/parse'
import { nanoid } from 'common/util/random'
import { HOUR_MS } from 'common/util/time'
import { log } from 'shared/monitoring/log'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'

// Sends an announcement post to every user, 1,000 users per transaction, in
// user id order. Progress lives in announcement_deliveries (see
// migrations/2026112201_announcement_deliveries.sql): a batch's notifications
// and the cursor commit together, so a send that stops for any reason resumes
// where it stopped, and no user is sent the announcement twice.
//
// The audience is every user who existed when the send was queued. (A signup
// still committing at that moment can be missed or not, depending on where
// its id falls: users.created_time is its transaction's start.) Each batch
// re-reads the post and stops the send if it has been unlisted or is no
// longer an announcement.

export const ANNOUNCEMENT_BATCH_SIZE = 1000
// A failing batch is retried this many times before the send gives up for
// now. The resume job takes it up again later.
const ATTEMPTS_PER_BATCH = 3
const RETRY_DELAY_MS = 2000
// A send not finished and not touched for this long has stopped: its sender
// died or gave up. Every batch takes well under a second.
export const STALLED_AFTER_MINUTES = 2
// Characters of the post's text a notification carries.
const SOURCE_TEXT_LENGTH = 200

// What every recipient's notification shares; the insert adds id, userId
// and createdTime.
type NotificationTemplate = Omit<Notification, 'id' | 'userId' | 'createdTime'>

export type AnnouncementDeliveryResult = {
  postId: string
  // Users sent the announcement by this call.
  sent: number
  // Users sent it so far, by every call.
  totalSent: number
  // No one is left to send to, or the send was closed (see closed).
  finished: boolean
  // Why the send was closed before reaching everyone: the post was unlisted,
  // is not an announcement, or is gone.
  closed?: string
  // Why this call stopped with users still to send to.
  error?: string
}

// Records that the post is to be sent to every user. Call it in the
// transaction that creates the post, so an announcement never exists without
// it. Calling it again for the same post does nothing.
//
// skipUsersWhoHaveIt: before sending to a user, check they have no
// notification for this post already. For a post some users were sent
// another way (the sender before this one stopped part way). It is stored on
// the delivery, so a resumed send keeps doing it. Slower: it reads each
// user's notifications.
export async function queueAnnouncementDelivery(
  pg: SupabaseDirectClient | SupabaseTransaction,
  postId: string,
  options: { skipUsersWhoHaveIt?: boolean } = {}
) {
  await pg.none(
    `insert into announcement_deliveries (post_id, skip_existing)
     values ($1, $2)
     on conflict (post_id) do nothing`,
    [postId, options.skipUsersWhoHaveIt ?? false]
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
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new Error(`batchSize must be a positive integer, not ${batchSize}`)

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
      batch = await pg.tx((tx) => sendNextBatch(tx, postId, batchSize))
    } catch (e) {
      failures++
      const error = e instanceof Error ? e.message : String(e)
      // Never the pg error object itself: it carries the query, and an
      // oversized log entry is dropped without a trace.
      await pg
        .none(
          `update announcement_deliveries
           set last_error = $2, updated_time = now()
           where post_id = $1 and finished_time is null`,
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
    if (batch.closed) {
      log.warn(`Announcement ${postId} closed: ${batch.closed}`, {
        postId,
        totalSent,
      })
      return {
        postId,
        sent,
        totalSent,
        finished: true,
        closed: batch.closed,
      }
    }
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

// Resumes every send that has stopped. Run by the scheduler. Throws, once it
// has tried them all, if any is still unfinished.
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
    try {
      results.push(await deliverAnnouncement(pg, postId, options))
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      results.push({ postId, sent: 0, totalSent: 0, finished: false, error })
    }
  }
  const failed = results.filter((r) => !r.finished)
  if (failed.length > 0) {
    // Another sender may have finished one since this run gave up on it.
    const stillOpen = new Set(
      await pg.map(
        `select post_id from announcement_deliveries
         where post_id = any($1) and finished_time is null`,
        [failed.map((r) => r.postId)],
        (r: { post_id: string }) => r.post_id
      )
    )
    const unfinished = failed.filter((r) => stillOpen.has(r.postId))
    if (unfinished.length > 0)
      throw new Error(
        `Announcement sends still unfinished: ${unfinished
          .map((r) => `${r.postId} (${r.error})`)
          .join(', ')}`
      )
  }
  return results
}

type BatchResult = {
  sent: number
  totalSent: number
  finished: boolean
  closed?: string
}

async function sendNextBatch(
  tx: SupabaseTransaction,
  postId: string,
  batchSize: number
): Promise<BatchResult> {
  // The row lock makes concurrent senders take turns: the second one waits
  // here, then reads the cursor the first one committed.
  const delivery = await tx.oneOrNone<{
    last_user_id: string | null
    sent_count: number
    finished: boolean
    skip_existing: boolean
    last_error: string | null
  }>(
    `select last_user_id, sent_count, skip_existing, last_error,
       finished_time is not null as finished
     from announcement_deliveries
     where post_id = $1
     for update`,
    [postId]
  )
  if (!delivery) throw new Error(`Announcement ${postId} is not queued`)
  if (delivery.finished) {
    // A finished row keeps an error only if it was closed early (see below):
    // every batch that sends clears it, and a failure never writes to a
    // finished row.
    return {
      sent: 0,
      totalSent: delivery.sent_count,
      finished: true,
      closed: delivery.last_error ?? undefined,
    }
  }

  // Read with every batch: a post unlisted mid-send stops going out. The
  // share lock makes an unlist wait for this batch to commit, or this batch
  // wait for the unlist and see it, so no batch goes out after one.
  const post = await tx.oneOrNone<{ data: TopLevelPost }>(
    `select data from old_posts where id = $1 for share`,
    [postId]
  )
  const closed = !post
    ? 'post not found'
    : !post.data.isAnnouncement
    ? 'post is not an announcement'
    : post.data.visibility === 'unlisted'
    ? 'post is unlisted'
    : undefined
  if (closed || !post) {
    await tx.none(
      `update announcement_deliveries
       set finished_time = now(), updated_time = now(), last_error = $2
       where post_id = $1`,
      [postId, closed]
    )
    return {
      sent: 0,
      totalSent: delivery.sent_count,
      finished: true,
      closed,
    }
  }

  // Everyone who existed when the send was queued, whenever their batch
  // comes round.
  const userIds = await tx.map(
    `select id from users
     where ($2::text is null or id > $2)
       and created_time <= (
         select created_time from announcement_deliveries where post_id = $1
       )
     order by id
     limit $3`,
    [postId, delivery.last_user_id, batchSize],
    (r: { id: string }) => r.id
  )

  let recipients = userIds
  if (delivery.skip_existing && userIds.length > 0) {
    // Looked up by user id, and only among notifications from (just before)
    // the post on: every copy of it was made after it was posted. The time
    // bound is a condition on user_notifications_user_id_read_created, so
    // Postgres reads only those rows. Measured on prod 2026-11-22 for 1,000
    // users (~146 notifications each): 0.66 s and 2,236 pages read, against
    // 50 s and 86,452 pages without the bound. The hour allows for clocks
    // that disagree between machines.
    const since = (post.data.createdTime ?? 0) - HOUR_MS
    const have = new Set(
      await tx.map(
        `select distinct user_id from user_notifications
         where user_id = any($1::text[])
           and (data->'createdTime')::bigint >= $3
           and data->>'sourceId' = $2
           and data->>'sourceType' = 'post'`,
        [userIds, postId, since],
        (r: { user_id: string }) => r.user_id
      )
    )
    recipients = userIds.filter((id) => !have.has(id))
  }

  if (recipients.length > 0) {
    // Stamped as it is sent, not when it was queued, and by the database's
    // clock, not the sending machine's (a script runs on a developer's
    // machine): the notifications page fetches only what is newer than the
    // newest notification it has, so a batch stamped early could sort behind
    // notifications that user got in the meantime and never be fetched.
    //
    // A fresh random id per user, as every other notification has: some
    // queries still join user_notifications on notification_id, and one
    // shared id would match every user's row (see #4143). The ids and user
    // ids go as two array parameters, so the statement stays small however
    // large the batch.
    await tx.none(
      `insert into user_notifications (user_id, notification_id, data)
       select n.user_id, n.notification_id,
         $3::jsonb || jsonb_build_object(
           'id', n.notification_id,
           'userId', n.user_id,
           'createdTime', (extract(epoch from statement_timestamp()) * 1000)::bigint
         )
       from unnest($1::text[], $2::text[]) as n(user_id, notification_id)`,
      [
        recipients,
        recipients.map(() => nanoid(6)),
        JSON.stringify(notificationTemplate(post.data)),
      ]
    )
  }
  const inserted = recipients.length

  const finished = userIds.length < batchSize
  const totalSent = delivery.sent_count + inserted
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
  return { sent: inserted, totalSent, finished }
}

function notificationTemplate(post: TopLevelPost): NotificationTemplate {
  return {
    reason: 'admin',
    isSeen: false,
    sourceId: post.id,
    sourceType: 'post',
    sourceUpdateType: 'created',
    sourceUserName: post.creatorName,
    sourceUserUsername: post.creatorUsername,
    sourceUserAvatarUrl: post.creatorAvatarUrl ?? '',
    sourceText: truncateText(
      richTextToString(post.content),
      SOURCE_TEXT_LENGTH
    ),
    sourceSlug: `post/${post.slug}`,
    sourceTitle: post.title,
  }
}

// The first `length` characters, never splitting one. String#slice counts
// UTF-16 units, so a cut between the two halves of an emoji leaves a lone
// surrogate, which JSON carries as "\udXXX" and Postgres jsonb refuses: the
// insert fails, the same way on every retry. Array.from walks whole code
// points. (A post's own text can't hold a lone surrogate: jsonb refuses it.)
export function truncateText(text: string, length: number) {
  return Array.from(text).slice(0, length).join('')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
