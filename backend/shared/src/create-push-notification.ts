import { partition } from 'lodash'
import { Expo, ExpoPushMessage, ExpoPushSuccessTicket } from 'expo-server-sdk'

import { Notification } from 'common/notification'
import { PrivateUser } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from './supabase/users'
import { FieldVal } from './supabase/utils'

type ExpoPushMessageWithNotification = ExpoPushMessage & {
  data: Notification
}

export const createPushNotification = async (
  notification: Notification,
  privateUser: PrivateUser,
  title: string,
  body: string
) => {
  const pg = createSupabaseDirectClient()
  const expo = new Expo()
  const { sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    notification.reason
  )
  if (!sendToMobile) return
  const somePushTokens = [privateUser.pushToken]
  // Create the messages that you want to send to clients
  const messages: ExpoPushMessageWithNotification[] = []
  for (const pushToken of somePushTokens) {
    // Check that all your push tokens appear to be valid Expo push tokens
    if (!Expo.isExpoPushToken(pushToken)) {
      log(`Push token ${pushToken} is not a valid Expo push token`)
      continue
    }

    // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
    messages.push({
      to: pushToken,
      channelId: 'default',
      title,
      body,
      data: notification,
    })
  }
  const tickets = await expo.sendPushNotificationsAsync(messages)
  // write successful tickets to db
  const [successTickets, errorTickets] = partition(
    tickets,
    (ticket) => ticket.status === 'ok'
  )
  await Promise.all(
    (successTickets as ExpoPushSuccessTicket[]).map(async (ticket) =>
      pg.none(
        `
          insert into push_notification_tickets (id,status, user_id, notification_id, receipt_status)
          values ($1, $2, $3, $4, $5)
          `,
        [
          ticket.id,
          ticket.status,
          privateUser.id,
          notification.id,
          'not-checked',
        ]
      )
    )
  )
  await Promise.all(
    errorTickets.map(async (ticket) => {
      if (ticket.status === 'error') {
        log('Error generating push notification, ticket:', ticket)
        if (ticket.details?.error === 'DeviceNotRegistered') {
          // set private user pushToken to null
          await updatePrivateUser(pg, privateUser.id, {
            pushToken: FieldVal.delete(),
          })
        }
      }
    })
  )
}
