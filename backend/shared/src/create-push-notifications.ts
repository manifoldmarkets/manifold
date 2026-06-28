import { Expo, ExpoPushMessage } from 'expo-server-sdk'

import { Notification } from 'common/notification'
import { PrivateUser } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from './supabase/users'
import { bulkInsert, FieldVal } from './supabase/utils'

type ExpoPushMessageWithNotification = ExpoPushMessage & {
  data: Notification
}

export const createPushNotifications = async (
  userAndNotification: [PrivateUser, Notification, string, string][]
) => {
  const pg = createSupabaseDirectClient()
  const expo = new Expo()
  const messages: ExpoPushMessageWithNotification[] = []

  for (const [privateUser, notification, title, body] of userAndNotification) {
    const { sendToMobile } = getNotificationDestinationsForUser(
      privateUser,
      notification.reason
    )
    if (!sendToMobile) continue

    const pushToken = privateUser.pushToken
    if (!Expo.isExpoPushToken(pushToken)) {
      log.error(`Push token ${pushToken} is not a valid Expo push token`)
      continue
    }

    messages.push({
      to: pushToken,
      channelId: 'default',
      title,
      body,
      data: notification,
    })
  }
  const chunks = expo.chunkPushNotifications(messages)
  // chunkPushNotifications preserves order, and sendPushNotificationsAsync
  // returns one ticket per message in the same order. Track the running offset
  // into `messages` so each ticket maps back to the message (and recipient) it
  // came from. The previous code indexed into post-partition/post-filter arrays,
  // which misattributed tickets and could delete the wrong user's push token.
  let messageOffset = 0
  for (const chunk of chunks) {
    const tickets = await expo.sendPushNotificationsAsync(chunk)

    const values: {
      id: string
      receipt_status: string
      user_id: string
      notification_id: string
      status: string
    }[] = []

    await Promise.all(
      tickets.map(async (ticket, i) => {
        const message = messages[messageOffset + i]
        if (ticket.status === 'ok') {
          values.push({
            id: ticket.id,
            receipt_status: 'not-checked',
            user_id: message.data.userId,
            notification_id: message.data.id,
            status: ticket.status,
          })
        } else if (ticket.status === 'error') {
          log.error('Error generating push notification, ticket:', { ticket })
          if (ticket.details?.error === 'DeviceNotRegistered') {
            // The device this token belonged to is gone; clear it so we stop
            // trying to push to it.
            await updatePrivateUser(pg, message.data.userId, {
              pushToken: FieldVal.delete(),
            })
          }
        }
      })
    )

    if (values.length > 0) {
      await bulkInsert(pg, 'push_notification_tickets', values)
    }

    messageOffset += chunk.length
  }
}
