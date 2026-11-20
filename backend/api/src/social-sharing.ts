import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  ensureSocialSource,
  findSocialSource,
  subscribeToSocialThread,
} from 'shared/social-discussion'
import {
  assertSocialInteraction,
  getSocialViewer,
  hydrateSocialPosts,
  limitSocialWrite,
  lockSocialThread,
  socialAuthor,
} from 'shared/social-posts'
import { getPrivateUser } from 'shared/utils'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { Notification } from 'common/notification'
import { socialPostPath } from 'common/social-post'
import { broadcast } from 'shared/websockets/server'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

export const repostSocialPost: APIHandler<'repost-social-post'> =
  onlyUsersWhoCanPerformAction('post', async ({ source, remove }, auth) => {
    const pg = createSupabaseDirectClient()
    const actor = await socialAuthor(auth.uid, !remove)
    const viewer = await getSocialViewer(auth.uid)
    const { row, notify } = await pg.tx(async (tx) => {
      // Undoing a share looks the item up and never creates it: there is
      // nothing to undo for an item that was never put on Yap.
      const original = remove
        ? await findSocialSource(tx, source)
        : await ensureSocialSource(tx, source, viewer)
      if (!original) throw new APIError(404, 'You have not re-Yapped this')
      const row = await lockSocialThread(tx, original.id)
      await limitSocialWrite(tx, auth.uid, 'repost', 60)
      if (remove) {
        await tx.none(
          'update social_reposts set active=false where post_id=$1 and user_id=$2',
          [row.id, auth.uid]
        )
        return { row, notify: false }
      }
      await assertSocialInteraction(tx, row, viewer, true)
      const previous = await tx.oneOrNone<{ active: boolean }>(
        'select active from social_reposts where post_id=$1 and user_id=$2',
        [row.id, auth.uid]
      )
      await tx.none(
        `insert into social_reposts(post_id,user_id) values ($1,$2)
        on conflict (post_id,user_id) do update set active=true,
        bumped_time=case when social_reposts.bumped_time <= now()-interval '24 hours' then now() else social_reposts.bumped_time end`,
        [row.id, auth.uid]
      )
      return { row, notify: !previous }
    })
    return {
      result: (await hydrateSocialPosts(pg, [row], viewer))[0],
      continue: async () => {
        if (!notify || row.user_id === actor.id || actor.isBot) return
        const recipient = await getPrivateUser(row.user_id)
        if (
          !recipient ||
          recipient.blockedUserIds.includes(actor.id) ||
          recipient.blockedByUserIds.includes(actor.id) ||
          !getNotificationDestinationsForUser(
            recipient,
            'user_liked_your_content'
          ).sendToBrowser
        )
          return
        const { count } = await pg.one<{ count: number }>(
          'select count(*)::int as count from social_reposts where post_id=$1 and active and user_id<>$2 and not(user_id=any($3::text[]))',
          [
            row.id,
            row.user_id,
            [...recipient.blockedUserIds, ...recipient.blockedByUserIds],
          ]
        )
        const notification: Notification = {
          id: `social-repost-${row.id}`,
          userId: row.user_id,
          reason: 'user_liked_your_content',
          createdTime: Date.now(),
          isSeen: false,
          sourceId: row.id,
          sourceType: 'social_repost',
          sourceUpdateType: 'created',
          sourceUserName: actor.name,
          sourceUserUsername: actor.username,
          sourceUserAvatarUrl: actor.avatarUrl ?? '',
          data: { sourceUserId: actor.id, repostCount: count },
          sourceText: row.text.slice(0, 200),
          sourceSlug: socialPostPath(row.id),
          sourceTitle: 'Yap',
        }
        await pg.none(
          `insert into user_notifications(user_id,notification_id,data) values ($1,$2,$3)
          on conflict (user_id,notification_id) do update set data=excluded.data`,
          [row.user_id, notification.id, notification]
        )
        broadcast(`user-notifications/${row.user_id}`, { notification })
      },
    }
  })

export const setSocialThreadSubscription: APIHandler<
  'set-social-thread-subscription'
> = async ({ id, muted }, auth) => {
  const pg = createSupabaseDirectClient()
  const viewer = await getSocialViewer(auth.uid)
  await pg.tx(async (tx) => {
    const row = await lockSocialThread(tx, id)
    if (!muted) await assertSocialInteraction(tx, row, viewer)
    await subscribeToSocialThread(tx, row.root_id, auth.uid)
    await tx.none(
      'update social_thread_subscriptions set muted=$3 where root_id=$1 and user_id=$2',
      [row.root_id, auth.uid, muted]
    )
  })
  return { success: true }
}
