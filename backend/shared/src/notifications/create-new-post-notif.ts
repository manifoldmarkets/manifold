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
import { getAllUserIds, getUserFollowerIds } from 'shared/supabase/users'
import { richTextToString } from 'common/util/parse'

export const createNewPostFromFollowedUserNotification = async (
  post: TopLevelPost,
  creator: User,
  pg: SupabaseDirectClient
) => {
  const bulkNotifications: Notification[] = []

  // Get all followers of the post creator
  const followerIds = post.isAnnouncement
    ? await getAllUserIds(pg)
    : await getUserFollowerIds(creator.id, pg)

  if (post.isAnnouncement) {
    for (const userId of followerIds) {
      const notification: Notification = {
        id: nanoid(6),
        userId: userId,
        reason: 'admin',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: post.id,
        sourceType: 'post',
        sourceUpdateType: 'created',
        sourceUserName: creator.name,
        sourceUserUsername: creator.username,
        sourceUserAvatarUrl: creator.avatarUrl,
        sourceText: richTextToString(post.content),
        sourceSlug: `post/${post.slug}`,
        sourceTitle: post.title,
      }
      bulkNotifications.push(notification)
    }
  } else {
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
          sourceText: richTextToString(post.content),
          sourceSlug: `post/${post.slug}`,
          sourceTitle: post.title,
        }
        bulkNotifications.push(notification)
      }
    }
  }

  if (bulkNotifications.length > 0) {
    await bulkInsertNotifications(bulkNotifications, pg)
  }
}
