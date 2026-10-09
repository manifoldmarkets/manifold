import { Notification } from 'common/notification'
import { socialPostPath } from 'common/social-post'
import { getSocialMentionIds } from 'common/social-rich-content'
import { User } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import type { SocialRow } from './social-posts'
import type { SupabaseDirectClient } from './supabase/init'
import { insertNotificationToSupabase } from './supabase/notifications'
import { getPrivateUser } from './utils'

// Creation only: editing a post must not repeatedly notify the same people.
export async function notifySocialMentions(
  pg: SupabaseDirectClient,
  post: SocialRow,
  actor: User,
  parentAuthorId?: string
) {
  if (actor.isBot || post.deleted_time) return
  if (!getSocialMentionIds(post.rich_content).length) return

  // The continuation may run after an edit or deletion. Use the current text
  // and tags, and check the root author before notifying a reader of a reply.
  const current = await pg.oneOrNone<SocialRow & { root_user_id: string }>(
    `select p.*, root.user_id as root_user_id
     from social_posts p join social_posts root on root.id=p.root_id
     where p.id=$1 and p.deleted_time is null`,
    [post.id]
  )
  if (!current) return
  const userIds = [...new Set(getSocialMentionIds(current.rich_content))]
    .filter((id) => id !== actor.id)
    .slice(0, 10)

  await Promise.all(
    userIds.map(async (userId) => {
      const recipient = await getPrivateUser(userId, pg)
      if (!recipient) return
      const blocked = [
        ...recipient.blockedUserIds,
        ...recipient.blockedByUserIds,
      ]
      if (blocked.includes(actor.id) || blocked.includes(current.root_user_id))
        return
      if (
        !getNotificationDestinationsForUser(recipient, 'tagged_user')
          .sendToBrowser
      )
        return
      // A mention still matters when this reader has disabled reply notices.
      if (
        current.parent_id &&
        userId === parentAuthorId &&
        getNotificationDestinationsForUser(recipient, 'social_replies')
          .sendToBrowser
      )
        return

      const notification: Notification = {
        // Notifications are keyed by (user_id, notification_id). Sharing the
        // ID makes cleanup indexed even if a later edit removes the tags.
        id: `social-mention-${current.id}`,
        userId,
        reason: 'tagged_user',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: current.id,
        sourceType: 'social_mention',
        sourceUpdateType: 'created',
        sourceUserName: actor.name,
        sourceUserUsername: actor.username,
        sourceUserAvatarUrl: actor.avatarUrl ?? '',
        data: { sourceUserId: actor.id },
        sourceText: [...current.text].slice(0, 200).join(''),
        sourceSlug: socialPostPath(current.id),
        sourceTitle: 'Yap',
      }
      await insertNotificationToSupabase(notification, pg)
    })
  )
}
