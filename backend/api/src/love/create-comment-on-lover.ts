import { APIError, authEndpoint, validate } from 'api/helpers'
import { MAX_COMMENT_JSON_LENGTH } from 'api/create-comment'
import { z } from 'zod'
import { contentSchema } from 'shared/zod-types'
import { JSONContent } from '@tiptap/core'
import { getPrivateUser, getUser, getUserSupabase } from 'shared/utils'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { Notification } from 'common/notification'
import { insertNotificationToSupabase } from 'shared/create-notification'
import { User } from 'common/user'
import { createPushNotification } from 'shared/create-push-notification'
import { richTextToString } from 'common/util/parse'
import * as crypto from 'crypto'

const postSchema = z.object({
  userId: z.string(),
  content: contentSchema,
  replyToCommentId: z.number().optional(),
})
export const createcommentonlover = authEndpoint(async (req, auth) => {
  const {
    userId,
    content: submittedContent,
    replyToCommentId,
  } = validate(postSchema, req.body)

  const { creator, content } = await validateComment(
    userId,
    auth.uid,
    submittedContent
  )

  const onUser = await getUserSupabase(userId)
  if (!onUser) throw new APIError(404, 'User not found')

  const pg = createSupabaseDirectClient()
  const comment = await pg.oneOrNone(
    `insert into lover_comments (user_id, user_name, user_username, user_avatar_url, on_user_id, content, reply_to_comment_id)
        values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [
      creator.id,
      creator.name,
      creator.username,
      creator.avatarUrl,
      userId,
      content,
      replyToCommentId,
    ]
  )
  if (onUser.id !== creator.id)
    await createNewCommentOnLoverNotification(
      onUser,
      creator,
      richTextToString(content),
      comment.id,
      pg
    )

  return { status: 'success' }
})

const validateComment = async (
  userId: string,
  creatorId: string,
  content: JSONContent
) => {
  const creator = await getUser(creatorId)

  if (!creator) throw new APIError(401, 'Your account was not found')
  if (creator.isBannedFromPosting) throw new APIError(403, 'You are banned')

  const otherUser = await getPrivateUser(userId)
  if (!otherUser) throw new APIError(404, 'Other user not found')
  if (otherUser.blockedUserIds.includes(creatorId)) {
    throw new APIError(404, 'User has blocked you')
  }

  if (JSON.stringify(content).length > MAX_COMMENT_JSON_LENGTH) {
    throw new APIError(
      400,
      `Comment is too long; should be less than ${MAX_COMMENT_JSON_LENGTH} as a JSON string.`
    )
  }
  return { content, creator }
}

const createNewCommentOnLoverNotification = async (
  onUser: User,
  creator: User,
  sourceText: string,
  commentId: number,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(onUser.id)
  if (!privateUser) return
  const id = crypto.randomUUID()
  const reason = 'tagged_user' // not really true, but it's pretty close
  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  const notification: Notification = {
    id,
    userId: privateUser.id,
    reason,
    createdTime: Date.now(),
    isSeen: false,
    sourceId: commentId.toString(),
    sourceType: 'comment_on_lover',
    sourceUpdateType: 'created',
    sourceUserName: creator.name,
    sourceUserUsername: creator.username,
    sourceUserAvatarUrl: creator.avatarUrl,
    sourceText: sourceText,
    sourceSlug: onUser.username,
  }
  if (sendToBrowser) {
    await insertNotificationToSupabase(notification, pg)
  }
  if (sendToMobile) {
    await createPushNotification(
      notification,
      privateUser,
      `${creator.name} commented on your profile`,
      sourceText
    )
  }
}
