import { JSONContent } from '@tiptap/core'
import { APIError } from 'common/api/utils'
import { ChatVisibility } from 'common/chat-message'
import { Notification } from 'common/notification'
import { Json } from 'common/supabase/schema'
import { User } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { nanoid } from 'common/util/random'
import { HOUR_MS } from 'common/util/time'
import * as dayjs from 'dayjs'
import * as timezone from 'dayjs/plugin/timezone'
import * as utc from 'dayjs/plugin/utc'
import { first } from 'lodash'
import { track } from 'shared/analytics'
import { createPushNotifications } from 'shared/create-push-notifications'
import { log } from 'shared/monitoring/log'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { getPrivateUser, getUser } from 'shared/utils'
import { broadcast } from 'shared/websockets/server'
dayjs.extend(utc)
dayjs.extend(timezone)
export const leaveChatContent = (userName: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ text: `${userName} left the chat`, type: 'text' }],
    },
  ],
})
export const joinChatContent = (userName: string) => {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ text: `${userName} joined the chat!`, type: 'text' }],
      },
    ],
  }
}

export const insertPrivateMessage = async (
  content: Json,
  channelId: number,
  userId: string,
  visibility: ChatVisibility,
  pg: SupabaseDirectClient
) => {
  const lastMessage = await pg.one(
    `insert into private_user_messages (content, channel_id, user_id, visibility)
    values ($1, $2, $3, $4) returning created_time`,
    [content, channelId, userId, visibility]
  )
  await pg.none(
    `update private_user_message_channels set last_updated_time = $1 where id = $2`,
    [lastMessage.created_time, channelId]
  )
}

export const addUsersToPrivateMessageChannel = async (
  userIds: string[],
  channelId: number,
  pg: SupabaseDirectClient
) => {
  await Promise.all(
    userIds.map((id) =>
      pg.none(
        `insert into private_user_message_channel_members (channel_id, user_id, role, status)
                values
                ($1, $2, 'member', 'proposed')
                on conflict do nothing
              `,
        [channelId, id]
      )
    )
  )
  await pg.none(
    `update private_user_message_channels set last_updated_time = now() where id = $1`,
    [channelId]
  )
}

export const createPrivateUserMessageMain = async (
  creator: User,
  channelId: number,
  content: JSONContent,
  pg: SupabaseDirectClient,
  visibility: ChatVisibility
) => {
  // Normally, users can only submit messages to channels that they are members of
  const authorized = await pg.oneOrNone(
    `select 1
       from private_user_message_channel_members
       where channel_id = $1
         and user_id = $2`,
    [channelId, creator.id]
  )
  if (!authorized)
    throw new APIError(403, 'You are not authorized to post to this channel')

  await notifyOtherUserInChannelIfInactive(channelId, creator, pg)
  await insertPrivateMessage(content, channelId, creator.id, visibility, pg)

  const privateMessage = {
    content: content as Json,
    channel_id: channelId,
    user_id: creator.id,
  }

  await pg.none(
    `update private_user_message_channel_members
      set status = 'joined'
       where channel_id = $1
         and user_id = $2
         and status != 'joined'`,
    [channelId, creator.id]
  )

  const otherUserIds = await pg.map<string>(
    `select user_id from private_user_message_channel_members
        where channel_id = $1 and user_id != $2
        and status != 'left'
        `,
    [channelId, creator.id],
    (r) => r.user_id
  )
  otherUserIds.concat(creator.id).forEach((otherUserId) => {
    broadcast(`private-user-messages/${otherUserId}`, {})
  })

  track(creator.id, 'send private message', {
    channelId,
    otherUserIds,
  })

  return { status: 'success', privateMessage }
}
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
    `select coalesce(ts_to_millis(max(greatest(ucv.last_page_view_ts, ucv.last_promoted_view_ts, ucv.last_card_view_ts))),0) as ts
     from user_contract_views ucv where ucv.user_id = $1`,
    [otherUserId.user_id]
  )
  log('last user contract view for user ' + otherUserId.user_id, lastUserEvent)
  if (lastUserEvent && lastUserEvent.ts > Date.now() - HOUR_MS) return

  const otherUser = await getUser(otherUserId.user_id)
  if (!otherUser) return

  await createNewMessageNotification(creator, otherUser, channelId)
}
const createNewMessageNotification = async (
  fromUser: User,
  toUser: User,
  channelId: number
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const reason = 'new_message'
  // TODO: send email
  const { sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  const sourceText = `${fromUser.name} sent you a message!`
  const id = nanoid(6)
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
    await createPushNotifications([
      [privateUser, notification, `${fromUser.name} messaged you`, sourceText],
    ])
  }
}
