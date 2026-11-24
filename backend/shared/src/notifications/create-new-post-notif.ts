import { Notification } from 'common/notification'
import { User } from 'common/user'

import {
  getNotificationDestinationsForUser,
  userIsBlocked,
} from 'common/user-notification-preferences'
import { SupabaseDirectClient } from 'shared/supabase/init'

import { bulkInsertNotifications } from 'shared/supabase/notifications'
import { convertPrivateUser } from 'common/supabase/users'
import { nanoid } from 'common/util/random'
import { TopLevelPost } from 'common/top-level-post'
import { getUserFollowerIds } from 'shared/supabase/users'
import { richTextToString } from 'common/util/parse'
import { truncateText } from 'shared/notifications/announcement-delivery'

// Notifies the creator's followers of a new post. Announcements go to every
// user instead, through announcement-delivery.ts.
export const createNewPostFromFollowedUserNotification = async (
  post: TopLevelPost,
  creator: User,
  pg: SupabaseDirectClient
) => {
  const bulkNotifications: Notification[] = []
  const followerIds = await getUserFollowerIds(creator.id, pg)

  // Whole characters only: a cut emoji makes the insert fail.
  const sourceText = truncateText(richTextToString(post.content), 200)

  // Get all private users for the followers
  const privateUsers = await pg.map(
    `select * from private_users where id = any($1)`,
    [followerIds],
    convertPrivateUser
  )

  // For each follower, create a notification if they want it
  for (const privateUser of privateUsers) {
    if (userIsBlocked(privateUser, creator.id)) continue

    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      'contract_from_followed_user'
    )

    if (sendToBrowser) {
      const notification: Notification = {
        id: nanoid(6),
        userId: privateUser.id,
        reason: 'contract_from_followed_user',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: post.id,
        sourceType: 'post',
        sourceUpdateType: 'created',
        sourceUserName: creator.name,
        sourceUserUsername: creator.username,
        sourceUserAvatarUrl: creator.avatarUrl,
        sourceText,
        sourceSlug: `post/${post.slug}`,
        sourceTitle: post.title,
      }
      bulkNotifications.push(notification)
    }
  }

  if (bulkNotifications.length > 0) {
    await bulkInsertNotifications(bulkNotifications, pg)
  }
}
