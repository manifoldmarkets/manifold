import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { getPrivateUser, getUserSupabase, log } from 'shared/utils'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { Json } from 'common/supabase/schema'
import { contentSchema } from 'shared/zod-types'
import { MAX_COMMENT_JSON_LENGTH } from 'api/create-comment'
import { insertPrivateMessage } from 'shared/supabase/private-messages'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { User } from 'common/user'
import { first } from 'lodash'
import * as crypto from 'crypto'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { Notification } from 'common/notification'
import { createPushNotification } from 'shared/create-push-notification'
import { sendNewMessageEmail } from 'shared/emails'
import { HOUR_MS } from 'common/util/time'
import { tsToMillis } from 'common/supabase/utils'
dayjs.extend(utc)
dayjs.extend(timezone)

const postSchema = z
  .object({
    content: contentSchema,
    channelId: z.number().gte(0).int(),
  })
  .strict()

export const createprivateusermessage = authEndpoint(async (req, auth) => {
  const { content, channelId } = validate(postSchema, req.body)
  if (JSON.stringify(content).length > MAX_COMMENT_JSON_LENGTH) {
    throw new APIError(
      400,
      `Message JSON should be less than ${MAX_COMMENT_JSON_LENGTH}`
    )
  }
  const pg = createSupabaseDirectClient()
  const creator = await getUserSupabase(auth.uid)
  if (!creator) throw new APIError(401, 'Your account was not found')
  if (creator.isBannedFromPosting) throw new APIError(403, 'You are banned')

  // users can only submit messages to channels that they are members of
  const authorized = await pg.oneOrNone(
    `select 1 from private_user_message_channel_members
            where channel_id = $1 and user_id = $2`,
    [channelId, auth.uid]
  )
  if (!authorized)
    throw new APIError(403, 'You are not authorized to post to this channel')
  await notifyOtherUserInChannelIfInactive(channelId, creator, pg)
  await insertPrivateMessage(content, channelId, auth.uid, 'private', pg)

  const privateMessage = {
    content: content as Json,
    channel_id: channelId,
    user_id: creator.id,
  }

  return { status: 'success', privateMessage }
})

const notifyOtherUserInChannelIfInactive = async (
  channelId: number,
  creator: User,
  pg: SupabaseDirectClient
) => {
  const otherUserIds = await pg.manyOrNone<{ user_id: string }>(
    `select user_id from private_user_message_channel_members
        where channel_id = $1 and user_id != $2
        and status != 'left'
        `,
    [channelId, creator.id]
  )
  // We're only sending notifs for 1:1 channels
  if (!otherUserIds || otherUserIds.length > 1) return

  const otherUserId = first(otherUserIds)
  if (!otherUserId) return

  // We're only sending emails for users who have a lover profile
  const hasLoverProfile = await pg.oneOrNone(
    `select 1 from lovers where user_id = $1`,
    [otherUserId.user_id]
  )
  if (!hasLoverProfile) return

  const startOfDay = dayjs()
    .tz('America/Los_Angeles')
    .startOf('day')
    .toISOString()
  const previousMessagesThisDayBetweenTheseUsers = await pg.one(
    `select count(*) from private_user_messages
            where channel_id = $1
            and user_id = $2
            and created_time > $3
            `,
    [channelId, creator.id, startOfDay]
  )
  log('previous messages this day', previousMessagesThisDayBetweenTheseUsers)
  if (previousMessagesThisDayBetweenTheseUsers.count > 0) return

  const lastUserEvent = await pg.oneOrNone(
    `select ts from user_events where user_id = $1 order by ts desc limit 1`,
    [otherUserId.user_id]
  )
  log('lastUserEvent', lastUserEvent, 'for user', otherUserId.user_id)
  if (lastUserEvent && tsToMillis(lastUserEvent.ts) > Date.now() - HOUR_MS)
    return

  const otherUser = await getUserSupabase(otherUserId.user_id)
  if (!otherUser) return
  await createNewMessageNotification(creator, otherUser, channelId, pg)
}

const createNewMessageNotification = async (
  fromUser: User,
  toUser: User,
  channelId: number
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const reason = 'new_message'
  const { sendToMobile, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  const sourceText = `${fromUser.name} sent you a message!`
  const id = crypto.randomUUID()
  const notification: Notification = {
    id,
    userId: privateUser.id,
    reason,
    createdTime: Date.now(),
    isSeen: false,
    sourceId: channelId.toString(),
    sourceType: reason,
    sourceUpdateType: 'created',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceSlug: '/messages/' + channelId,
    sourceText,
  }

  if (sendToMobile) {
    await createPushNotification(
      notification,
      privateUser,
      `New message`,
      sourceText
    )
  }
  if (sendToEmail) {
    await sendNewMessageEmail(
      reason,
      privateUser,
      fromUser,
      toUser,
      channelId,
      sourceText
    )
  }
}
